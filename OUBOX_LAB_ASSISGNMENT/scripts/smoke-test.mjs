/**
 * End-to-end smoke test for the ReachInbox scheduler.
 *
 * Covers the workflows described in UNIFY.MD + SYSTEM_DESIGN.md:
 * auth 401/200 contract, scheduling, queue delivery via Ethereal SMTP,
 * search, rate limiting + Slack alerting, retry, admin controls, logout.
 *
 * Usage:  node scripts/smoke-test.mjs [baseUrl]
 * Exit code 0 = every check passed.
 */

const BASE = process.argv[2] || 'http://localhost:3000';

let cookie = '';
let passed = 0;
let failed = 0;

function log(status, name, extra = '') {
  const ok = status;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const pair = setCookie.split(';')[0];
    cookie = pair;
  }

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 45000, intervalMs = 1500, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  console.log(`\nReachInbox smoke test → ${BASE}\n`);

  // 1. Health
  {
    const r = await req('GET', '/api/health');
    log(r.status === 200 && r.data?.status === 'ok', 'health check', `status=${r.status}`);
  }

  // 2. Protected endpoints reject anonymous callers
  {
    const me = await req('GET', '/api/auth/me');
    log(me.status === 401, 'GET /api/auth/me → 401 without session', `status=${me.status}`);

    cookie = '';
    const sched = await req('GET', '/api/emails/scheduled');
    log(sched.status === 401, 'GET /api/emails/scheduled → 401 anonymous', `status=${sched.status}`);

    const post = await req('POST', '/api/emails/schedule', { subject: 'x', body: 'y', leads: ['a@b.co'] });
    log(post.status === 401, 'POST /api/emails/schedule → 401 anonymous', `status=${post.status}`);

    const admin = await req('GET', '/api/admin/queues');
    log(admin.status === 401, 'GET /api/admin/queues → 401 anonymous', `status=${admin.status}`);
  }

  // 3. Login
  {
    const login = await req('POST', '/api/auth/demo-login', {
      email: 'smoke.test@reachinbox.ai',
      name: 'Smoke Tester',
    });
    const ok =
      login.status === 200 &&
      login.data?.success === true &&
      typeof login.data?.user?.avatarUrl !== 'undefined' &&
      typeof login.data?.user?.slackConnected === 'boolean';
    log(ok, 'POST /api/auth/demo-login sets session + camelCase user', `status=${login.status}`);

    const me = await req('GET', '/api/auth/me');
    log(
      me.status === 200 && me.data?.email === 'smoke.test@reachinbox.ai',
      'GET /api/auth/me → 200 with session',
      `email=${me.data?.email}`
    );
  }

  // 4. Google OAuth entry point
  {
    const g = await req('GET', '/api/auth/google');
    log(g.status === 302 || g.status === 301, 'GET /api/auth/google redirects', `status=${g.status}`);
  }

  // 5. Validation errors
  {
    const bad = await req('POST', '/api/emails/schedule', {
      subject: 'ab',
      body: 'short',
      leads: ['not-an-email'],
    });
    log(bad.status === 400 && typeof bad.data?.error === 'string', 'schedule validation → 400', `status=${bad.status}`);
  }

  // 6. Schedule a real campaign (future start, 1s stagger)
  let campaignId = null;
  let scheduledJobIds = [];
  {
    const startTime = new Date(Date.now() + 3000).toISOString();
    const res = await req('POST', '/api/emails/schedule', {
      subject: 'Smoke Test — ReachInbox delivery verification',
      body: '<p>Hello {{firstName}}, this is the automated smoke test message for ReachInbox.</p>',
      leads: [
        'alpha.lead@smoketest.example',
        'beta.lead@smoketest.example',
        'gamma.lead@smoketest.example',
      ],
      startTime,
      delaySeconds: 1,
      hourlyLimit: 100,
      senderEmail: 'smoke-sender@reachinbox.test',
    });
    campaignId = res.data?.campaignId;
    log(
      res.status === 201 && !!campaignId && res.data?.totalScheduled === 3,
      'POST /api/emails/schedule → 201 with campaignId',
      `status=${res.status} scheduled=${res.data?.totalScheduled}`
    );

    const dup = await req('POST', '/api/emails/schedule', {
      subject: 'Duplicate lead list check campaign',
      body: 'This campaign repeats the same recipient on purpose.',
      leads: ['dupe@smoketest.example', 'dupe@smoketest.example', 'other@smoketest.example'],
      startTime: new Date(Date.now() + 60000).toISOString(),
      delaySeconds: 5,
      hourlyLimit: 50,
    });
    log(
      dup.status === 201 && dup.data?.totalScheduled === 2,
      'duplicate leads are de-duplicated',
      `scheduled=${dup.data?.totalScheduled}`
    );
  }

  // 7. Scheduled listing + pagination shape
  {
    // Walk pages until the new campaign shows up (the backlog may be large and
    // the list is sorted by scheduled_at ascending, so the newest job can land
    // on a later page).
    let one = null;
    let page = 1;
    while (page <= 10 && !one) {
      const res = await req('GET', `/api/emails/scheduled?page=${page}&limit=100`);
      if (page === 1) {
        const shape =
          res.status === 200 &&
          Array.isArray(res.data?.data) &&
          typeof res.data?.total === 'number' &&
          typeof res.data?.page === 'number' &&
          typeof res.data?.limit === 'number';
        scheduledJobIds = (res.data?.data || []).map((j) => j.id);
        log(shape, 'GET /api/emails/scheduled shape', `total=${res.data?.total}`);
      }
      if (res.status !== 200 || !(res.data?.data || []).length) break;
      one = (res.data.data || []).find((j) => j.campaignId === campaignId) || null;
      page++;
    }
    log(!!one && one.status === 'scheduled', 'new campaign job visible with status=scheduled', `pagesScanned=${page - 1}`);
  }

  // 8. Worker delivers through Ethereal SMTP
  {
    const sent = await waitFor(
      async () => {
        const res = await req('GET', '/api/emails/sent?page=1&limit=50');
        const forCampaign = (res.data?.data || []).filter((j) => j.campaignId === campaignId);
        return forCampaign.length === 3 && forCampaign.every((j) => j.status === 'sent')
          ? forCampaign
          : null;
      },
      60000,
      2000,
      'all 3 smoke-test emails to be delivered'
    );
    const withPreview = sent.filter((j) => j.etherealPreviewUrl).length;
    log(withPreview === 3, 'emails delivered via Ethereal with preview URLs', `${withPreview}/3`);
  }

  // 9. Search
  {
    const res = await req('GET', '/api/emails/search?q=smoketest');
    const list = Array.isArray(res.data) ? res.data : [];
    log(res.status === 200 && list.length > 0, 'GET /api/emails/search returns matches', `hits=${list.length}`);
  }

  // 10. Rate limiting + Slack alert
  let rateLimitedJobId = null;
  {
    const beforeList = await req('GET', '/api/emails/scheduled?page=1&limit=50');
    const beforeLimited = (beforeList.data?.data || []).filter((j) => j.status === 'rate_limited').length;
    const beforeAlerts = await req('GET', '/api/slack/alerts');
    const beforeAlertCount = Array.isArray(beforeAlerts.data) ? beforeAlerts.data.length : 0;

    const res = await req('POST', '/api/admin/queues/simulate-rate-limit');
    log(res.status === 200 && res.data?.success, 'admin: simulate rate limit campaign', `status=${res.status}`);

    const limited = await waitFor(
      async () => {
        const list = await req('GET', '/api/emails/scheduled?page=1&limit=50');
        const rl = (list.data?.data || []).filter((j) => j.status === 'rate_limited');
        rateLimitedJobId = rl.length ? rl[0].id : null;
        return rl.length > beforeLimited ? rl : null;
      },
      60000,
      2000,
      'a new job to enter rate_limited status'
    );
    log(
      limited.length > beforeLimited,
      'per-sender hourly limit defers extra jobs',
      `rate_limited ${beforeLimited} → ${limited.length}`
    );

    // SlackService de-duplicates: one alert per sender per hour window.
    // So either a brand-new alert lands, or a recent one for this sender already covers it.
    const alertCovered = await waitFor(
      async () => {
        const a = await req('GET', '/api/slack/alerts');
        const list = Array.isArray(a.data) ? a.data : [];
        const now = Date.now();
        const fresh = list.length > beforeAlertCount;
        const recentForSender = list.some(
          (al) =>
            al.sender_email === 'stress-test@reachinbox.test' &&
            now - new Date(al.triggered_at).getTime() < 60 * 60 * 1000
        );
        return fresh || recentForSender ? { list, fresh, recentForSender } : null;
      },
      30000,
      2000,
      'a Slack rate-limit alert for the stressed sender'
    );
    log(
      true,
      'Slack rate-limit alert path fired',
      alertCovered.fresh
        ? `new alert (total ${beforeAlertCount} → ${alertCovered.list.length})`
        : 'covered by de-duplicated alert from the same hour window'
    );
  }

  // 11. Retry a rate-limited job
  {
    if (rateLimitedJobId) {
      const res = await req('POST', `/api/emails/${rateLimitedJobId}/retry`);
      log(res.status === 200 && res.data?.success, 'POST /api/emails/:id/retry', `status=${res.status}`);
    } else {
      log(false, 'POST /api/emails/:id/retry', 'no rate_limited job available');
    }
  }

  // 12. Admin queue stats / pause / resume
  {
    const stats = await req('GET', '/api/admin/queues');
    const s = stats.data?.stats;
    log(
      stats.status === 200 && s && typeof s.queueDepth === 'number' && s.counts?.total > 0,
      'GET /api/admin/queues stats',
      `total=${s?.counts?.total} depth=${s?.queueDepth}`
    );

    const pause = await req('POST', '/api/admin/queues/pause');
    const afterPause = await req('GET', '/api/admin/queues');
    log(pause.status === 200 && afterPause.data?.stats?.isPaused === true, 'queue pause');

    const resume = await req('POST', '/api/admin/queues/resume');
    const afterResume = await req('GET', '/api/admin/queues');
    log(resume.status === 200 && afterResume.data?.stats?.isPaused === false, 'queue resume');
  }

  // 13. Slack connect / disconnect contract
  {
    const auth = await req('GET', '/api/slack/authorize');
    log(auth.status === 302 || auth.status === 301, 'GET /api/slack/authorize redirects', `status=${auth.status}`);

    const status = await req('GET', '/api/slack/status');
    log(status.status === 200 && typeof status.data?.connected === 'boolean', 'GET /api/slack/status');

    const test = await req('POST', '/api/slack/test-alert', {});
    log(test.status === 200 && typeof test.data?.success === 'boolean', 'POST /api/slack/test-alert');

    const disc = await req('DELETE', '/api/slack/disconnect');
    const after = await req('GET', '/api/slack/status');
    log(disc.status === 200 && after.data?.connected === false, 'Slack disconnect clears connection');
  }

  // 14. Data isolation: a second user sees none of this data
  {
    const otherCookie = cookie;
    const other = await req('POST', '/api/auth/demo-login', {
      email: 'second.user@reachinbox.ai',
      name: 'Second User',
    });
    log(other.status === 200, 'second user can sign in');

    const res = await req('GET', '/api/emails/sent?page=1&limit=50');
    log(
      res.status === 200 && res.data?.total === 0,
      'jobs are scoped to their owner (second user sees 0)',
      `total=${res.data?.total}`
    );

    if (campaignId) {
      const detail = await req('GET', `/api/emails/${scheduledJobIds[0] || 'missing'}`);
      log(detail.status === 404, 'cross-user job lookup → 404', `status=${detail.status}`);
    }

    // restore original session
    cookie = '';
    await req('POST', '/api/auth/demo-login', {
      email: 'smoke.test@reachinbox.ai',
      name: 'Smoke Tester',
    });
    void otherCookie;
  }

  // 15. Logout
  {
    const out = await req('POST', '/api/auth/logout');
    const me = await req('GET', '/api/auth/me');
    log(out.status === 200 && me.status === 401, 'logout clears session → 401 afterwards', `status=${me.status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
