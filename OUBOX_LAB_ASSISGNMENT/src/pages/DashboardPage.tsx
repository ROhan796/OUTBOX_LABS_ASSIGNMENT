import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, EmailJob, QueueLog, SlackAlert, SchedulePayload } from '../types/index.ts';
import {
  getScheduledEmails,
  getSentEmails,
  searchEmails,
  scheduleEmails,
  retryEmail,
} from '../api/emails.api.ts';
import {
  getSlackStatus,
  disconnectSlack,
  configureSlackWebhook,
  sendTestSlackAlert,
  getSlackAlerts,
  SlackStatus,
} from '../api/slack.api.ts';
import {
  getQueueAdminData,
  pauseQueue,
  resumeQueue,
  seedDemoCampaign,
  simulateRateLimitTest,
  resetQueues,
} from '../api/admin.api.ts';
import { Header } from '../components/layout/Header.tsx';
import { ComposeModal } from '../components/features/compose/ComposeModal.tsx';
import { ScheduledEmailsTable } from '../components/features/scheduled/ScheduledEmailsTable.tsx';
import { SentEmailsTable } from '../components/features/sent/SentEmailsTable.tsx';
import { QueueMonitor } from '../components/features/queue/QueueMonitor.tsx';
import { SlackModal } from '../components/features/slack/SlackModal.tsx';
import { SlackAlertsView } from '../components/features/slack/SlackAlertsView.tsx';
import { Plus, RefreshCw } from 'lucide-react';

interface DashboardPageProps {
  user: User;
  onLogout: () => void;
}

/** Poll cadence so job status flips (scheduled -> sent) show up live. */
const REFRESH_INTERVAL_MS = 4000;

export const DashboardPage: React.FC<DashboardPageProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent' | 'queue' | 'slack'>('scheduled');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isSlackModalOpen, setIsSlackModalOpen] = useState(false);

  const [scheduledPage, setScheduledPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);

  // Search results temporarily replace a table's paged list
  const [scheduledOverride, setScheduledOverride] = useState<EmailJob[] | null>(null);
  const [sentOverride, setSentOverride] = useState<EmailJob[] | null>(null);

  const queryClient = useQueryClient();
  const refreshAll = () => queryClient.invalidateQueries();

  // --- Data (TanStack Query: cache + refetchInterval polling) --------------
  const scheduledQuery = useQuery({
    queryKey: ['emails', 'scheduled', scheduledPage],
    queryFn: () => getScheduledEmails(scheduledPage, 20),
    refetchInterval: REFRESH_INTERVAL_MS,
    placeholderData: (prev) => prev,
  });

  const sentQuery = useQuery({
    queryKey: ['emails', 'sent', sentPage],
    queryFn: () => getSentEmails(sentPage, 20),
    refetchInterval: REFRESH_INTERVAL_MS,
    placeholderData: (prev) => prev,
  });

  const opsQuery = useQuery({
    queryKey: ['ops'],
    queryFn: async () => {
      const [admin, slack, alerts] = await Promise.all([
        getQueueAdminData(),
        getSlackStatus(),
        getSlackAlerts(),
      ]);
      return { admin, slack: slack as SlackStatus, alerts: alerts as SlackAlert[] };
    },
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  const scheduledJobs: EmailJob[] = scheduledOverride ?? scheduledQuery.data?.data ?? [];
  const sentJobs: EmailJob[] = sentOverride ?? sentQuery.data?.data ?? [];
  const totalScheduled = scheduledOverride ? scheduledOverride.length : scheduledQuery.data?.total ?? 0;
  const totalSent = sentOverride ? sentOverride.length : sentQuery.data?.total ?? 0;

  const queueStats = opsQuery.data?.admin.stats ?? null;
  const queueLogs: QueueLog[] = opsQuery.data?.admin.logs ?? [];
  const slackStatus = opsQuery.data?.slack ?? null;
  const slackAlerts: SlackAlert[] = opsQuery.data?.alerts ?? [];
  const isLoading = scheduledQuery.isPending || sentQuery.isPending;

  // --- OAuth return signals (UNIFY.md §9) ---------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slackConnected = params.get('slack_connected');
    const slackError = params.get('slack_error');
    const authSuccess = params.get('auth');
    const authError = params.get('auth_error');

    if (slackConnected === 'true') {
      toast.success('Slack workspace connected — rate limit alerts are now active.');
      queryClient.invalidateQueries({ queryKey: ['ops'] });
    } else if (slackError === 'true') {
      toast.error('Slack connection failed. Please try again.');
    } else if (authSuccess === 'success') {
      toast.success(`Signed in as ${user.name}`);
    } else if (authError) {
      toast.error('Google sign-in failed. Please try again.');
    }

    if (slackConnected || slackError || authSuccess || authError) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Search ---------------------------------------------------------------
  const handleScheduledSearch = async (query: string) => {
    if (!query.trim()) {
      setScheduledOverride(null);
      setScheduledPage(1);
      return;
    }
    try {
      const matched = await searchEmails(query);
      setScheduledOverride(
        matched.filter((j) => j.status === 'scheduled' || j.status === 'rate_limited')
      );
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleSentSearch = async (query: string) => {
    if (!query.trim()) {
      setSentOverride(null);
      setSentPage(1);
      return;
    }
    try {
      const matched = await searchEmails(query);
      setSentOverride(matched.filter((j) => j.status === 'sent' || j.status === 'failed'));
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // --- Campaign / queue actions --------------------------------------------
  const handleScheduleSubmit = async (payload: SchedulePayload) => {
    const res = await scheduleEmails(payload);
    toast.success(`Campaign scheduled! ${res.totalScheduled} emails added to queue.`);
    setScheduledOverride(null);
    setScheduledPage(1);
    await refreshAll();
  };

  const handleRetryJob = async (jobId: string) => {
    await retryEmail(jobId);
    toast.success('Job re-enqueued — moving back to Scheduled for immediate delivery.');
    await refreshAll();
  };

  const handleDisconnectSlack = async () => {
    await disconnectSlack();
    toast.success('Slack workspace disconnected.');
    await queryClient.invalidateQueries({ queryKey: ['ops'] });
  };

  const handleSaveSlackWebhook = async (webhookUrl: string, channel: string) => {
    await configureSlackWebhook(webhookUrl, channel);
    toast.success('Slack configuration saved.');
    await queryClient.invalidateQueries({ queryKey: ['ops'] });
  };

  const handleSendTestSlackAlert = async (msg?: string) => {
    const res = await sendTestSlackAlert(msg);
    if (res.success) toast.success(res.message);
    else toast.error(res.message);
    await queryClient.invalidateQueries({ queryKey: ['ops'] });
    return res;
  };

  const handlePauseQueue = async () => {
    await pauseQueue();
    toast.success('Queue execution paused.');
    await queryClient.invalidateQueries({ queryKey: ['ops'] });
  };

  const handleResumeQueue = async () => {
    await resumeQueue();
    toast.success('Queue execution resumed.');
    await queryClient.invalidateQueries({ queryKey: ['ops'] });
  };

  const handleSeedDemo = async () => {
    await seedDemoCampaign();
    toast.success('Seeded demo campaign with 10 leads! Processing at 2s delay.');
    setScheduledOverride(null);
    await refreshAll();
  };

  const handleSimulateRateLimit = async () => {
    await simulateRateLimitTest();
    toast.success('Stress test campaign scheduled! Hourly limit will trigger on lead 3.');
    setScheduledOverride(null);
    await refreshAll();
  };

  const handleResetQueues = async () => {
    if (confirm('Reset all queues, jobs, and rate limit counters?')) {
      await resetQueues();
      toast.success('All queues, database entries, and counters have been reset.');
      setScheduledOverride(null);
      setSentOverride(null);
      setScheduledPage(1);
      setSentPage(1);
      await refreshAll();
    }
  };

  const rateLimitedCount = scheduledJobs.filter((j) => j.status === 'rate_limited').length;

  return (
    <div className="min-h-screen bg-[#0F1117] text-[#E5E7EB] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        user={user}
        slackStatus={slackStatus}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCompose={() => setIsComposeOpen(true)}
        onOpenSlackModal={() => setIsSlackModalOpen(true)}
        onLogout={onLogout}
        counts={{
          scheduled: totalScheduled,
          sent: totalSent,
          rateLimited: rateLimitedCount,
        }}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Quick Context Summary Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#2A2D3E]">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#E5E7EB]">
              {activeTab === 'scheduled' && 'Scheduled Email Deliveries'}
              {activeTab === 'sent' && 'Sent Emails & Ethereal SMTP Previews'}
              {activeTab === 'queue' && 'Queue Engine & Worker Monitor'}
              {activeTab === 'slack' && 'Slack Rate-Limit Alert Notifications'}
            </h1>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {activeTab === 'scheduled' &&
                'Sequential delayed queue with atomic per-sender hourly limits'}
              {activeTab === 'sent' &&
                'Delivered messages with direct links to view web inbox on Ethereal Email'}
              {activeTab === 'queue' &&
                'Real-time inspection of worker pool, concurrency, delay depth, and logs'}
              {activeTab === 'slack' &&
                'Live notifications dispatched when cold email sending exceeds hourly quotas'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => refreshAll()}
              className="p-2 text-[#9CA3AF] hover:text-[#E5E7EB] bg-[#1A1D27] border border-[#2A2D3E] rounded-xl hover:bg-[#2A2D3E] transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsComposeOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#6C63FF] hover:bg-[#5A52E0] text-white text-xs font-semibold rounded-xl shadow-sm shadow-[#6C63FF]/30 transition-all duration-150 active:scale-95 whitespace-nowrap"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Compose Campaign</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Scheduled Emails */}
        {activeTab === 'scheduled' && (
          <ScheduledEmailsTable
            jobs={scheduledJobs}
            isLoading={isLoading}
            total={totalScheduled}
            page={scheduledPage}
            limit={20}
            onPageChange={(p) => {
              setScheduledOverride(null);
              setScheduledPage(p);
            }}
            onSearch={handleScheduledSearch}
            onRetry={handleRetryJob}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {/* Tab 2: Sent Emails */}
        {activeTab === 'sent' && (
          <SentEmailsTable
            jobs={sentJobs}
            isLoading={isLoading}
            total={totalSent}
            page={sentPage}
            limit={20}
            onPageChange={(p) => {
              setSentOverride(null);
              setSentPage(p);
            }}
            onSearch={handleSentSearch}
            onRetry={handleRetryJob}
            onOpenCompose={() => setIsComposeOpen(true)}
          />
        )}

        {/* Tab 3: Queue Monitor */}
        {activeTab === 'queue' && (
          <QueueMonitor
            stats={queueStats}
            logs={queueLogs}
            isLoading={isLoading}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ['ops'] })}
            onPause={handlePauseQueue}
            onResume={handleResumeQueue}
            onSeedDemo={handleSeedDemo}
            onSimulateRateLimit={handleSimulateRateLimit}
            onReset={handleResetQueues}
          />
        )}

        {/* Tab 4: Slack Alerts */}
        {activeTab === 'slack' && (
          <SlackAlertsView
            alerts={slackAlerts}
            slackStatus={slackStatus}
            onOpenSlackModal={() => setIsSlackModalOpen(true)}
            onSendTestAlert={handleSendTestSlackAlert}
          />
        )}
      </main>

      {/* Modals */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        onSubmit={handleScheduleSubmit}
      />

      <SlackModal
        isOpen={isSlackModalOpen}
        onClose={() => setIsSlackModalOpen(false)}
        slackStatus={slackStatus}
        onDisconnect={handleDisconnectSlack}
        onSaveWebhook={handleSaveSlackWebhook}
        onSendTestAlert={handleSendTestSlackAlert}
      />
    </div>
  );
};
