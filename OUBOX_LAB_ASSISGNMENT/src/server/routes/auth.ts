import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db.ts';
import { User } from '../types.ts';

export const authRouter = Router();

const SESSION_COOKIE = 'reachinbox_uid';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Shape returned to the client (camelCase contract in UNIFY.md §7) */
function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url || null,
    slackConnected: !!(user.slack_access_token || user.slack_webhook_url),
    slackChannel: user.slack_channel_id || null,
  };
}

/** Returns the session user id, or null when there is no valid session cookie. */
export function getSessionUserId(req: Request): string | null {
  const cookieUserId = req.cookies?.[SESSION_COOKIE];
  if (cookieUserId && db.getUser(cookieUserId)) {
    return cookieUserId;
  }
  return null;
}

/** Legacy helper — only safe behind requireAuth. */
export function getCurrentUserId(req: Request): string {
  return getSessionUserId(req) || db.getDefaultUser().id;
}

function setSessionCookie(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/** 401 guard — UNIFY.md §4: every protected endpoint answers { error: "Unauthorized" }. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getSessionUserId(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function frontendRedirect(query = ''): string {
  const base = process.env.FRONTEND_URL || '/';
  return `${base}${query}`;
}

function hasGoogleOAuthConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return !!(
    id &&
    secret &&
    !id.includes('your_google_client_id') &&
    !secret.includes('your_google_client_secret')
  );
}

// GET /api/auth/me — 401 when there is no session (UNIFY.md §4.3)
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = db.getUser(getSessionUserId(req)!);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(toPublicUser(user));
});

// GET /api/auth/google — initiates Google OAuth, or a simulated login in dev
authRouter.get('/google', (req: Request, res: Response) => {
  const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/google/callback`;

  if (hasGoogleOAuthConfigured()) {
    const scope = encodeURIComponent('email profile');
    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      `response_type=code&client_id=${encodeURIComponent(process.env.GOOGLE_CLIENT_ID!)}` +
      `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
      `&scope=${scope}&access_type=offline&prompt=select_account`;
    return res.redirect(authUrl);
  }

  // Graceful simulation when no OAuth client is configured (dev/demo mode)
  const user = db.getDefaultUser();
  setSessionCookie(res, user.id);
  db.addLog({
    level: 'info',
    message: `[Auth] Dev sign-in (Google OAuth not configured) as ${user.email}`,
  });
  return res.redirect(frontendRedirect('/?auth=success'));
});

// GET /api/auth/google/callback
authRouter.get('/google/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null;

  try {
    if (code && hasGoogleOAuthConfigured()) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: `${req.protocol}://${req.get('host')}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = (await tokenRes.json()) as { access_token?: string };

      if (tokens.access_token) {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = (await profileRes.json()) as {
          id?: string;
          email?: string;
          name?: string;
          picture?: string;
        };

        if (profile.email) {
          const user = db.upsertUser({
            email: profile.email,
            google_id: profile.id || `google_${profile.email}`,
            name: profile.name || profile.email.split('@')[0],
            avatar_url: profile.picture || null,
          });
          setSessionCookie(res, user.id);
          db.addLog({ level: 'success', message: `[Auth] Google OAuth sign-in as ${user.email}` });
          return res.redirect(frontendRedirect('/?auth=success'));
        }
      }

      db.addLog({ level: 'error', message: '[Auth] Google OAuth code exchange failed' });
      return res.redirect(frontendRedirect('/login?auth_error=google'));
    }
  } catch (err: any) {
    db.addLog({ level: 'error', message: `[Auth] Google OAuth callback error: ${err.message}` });
    return res.redirect(frontendRedirect('/login?auth_error=google'));
  }

  const user = db.getDefaultUser();
  setSessionCookie(res, user.id);
  return res.redirect(frontendRedirect('/?auth=success'));
});

// POST /api/auth/demo-login — explicit dev login from the login screen
authRouter.post('/demo-login', (req: Request, res: Response) => {
  const { email, name } = req.body || {};
  const user = db.upsertUser({
    email: email || 'demo@reachinbox.ai',
    name: name || 'Demo Engineer',
    avatar_url: '/src/assets/images/avatar_executive_user_1791228537474.jpg',
  });

  setSessionCookie(res, user.id);
  db.addLog({ level: 'success', message: `[Auth] Demo sign-in as ${user.email}` });

  res.json({ success: true, user: toPublicUser(user) });
});

// POST /api/auth/logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE);
  db.addLog({ level: 'info', message: '[Auth] Session terminated.' });
  res.json({ ok: true, success: true });
});

export { toPublicUser };
