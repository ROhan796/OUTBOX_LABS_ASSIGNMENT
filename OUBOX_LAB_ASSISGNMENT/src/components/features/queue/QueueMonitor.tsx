import React, { useState } from 'react';
import { QueueStats, QueueLog } from '../../../types/index.ts';
import {
  Activity,
  Play,
  Pause,
  RefreshCw,
  Cpu,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Gauge,
  Terminal,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface QueueMonitorProps {
  stats: QueueStats | null;
  logs: QueueLog[];
  isLoading: boolean;
  onRefresh: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onSeedDemo: () => Promise<void>;
  onSimulateRateLimit: () => Promise<void>;
  onReset: () => Promise<void>;
}

export const QueueMonitor: React.FC<QueueMonitorProps> = ({
  stats,
  logs,
  isLoading,
  onRefresh,
  onPause,
  onResume,
  onSeedDemo,
  onSimulateRateLimit,
  onReset,
}) => {
  const [isActing, setIsActing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<QueueLog | null>(null);

  const handleAction = async (fn: () => Promise<void>) => {
    setIsActing(true);
    try {
      await fn();
      onRefresh();
    } finally {
      setIsActing(false);
    }
  };

  const isPaused = stats?.isPaused || false;
  const counts = stats?.counts || {
    total: 0,
    scheduled: 0,
    sent: 0,
    failed: 0,
    rateLimited: 0,
    inMemoryDelayed: 0,
  };

  const rateLimitEntries = Object.entries(stats?.rateLimitCounters || {});

  return (
    <div className="space-y-6">
      {/* Top Banner: Queue State & Operational Controls */}
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isPaused
                  ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                  : 'bg-[#00D084]/15 text-[#00D084] border border-[#00D084]/30'
              }`}
            >
              <Activity className={`w-5 h-5 ${!isPaused ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#E5E7EB] tracking-tight">
                  BullMQ Queue & Worker Architecture
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                    isPaused
                      ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40'
                      : 'bg-[#00D084]/20 text-[#00D084] border border-[#00D084]/40'
                  }`}
                >
                  {isPaused ? 'Paused' : 'Active & Running'}
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] mt-0.5">
                Staggered delayed execution, Redis atomic hourly limits, Ethereal fake SMTP, and restart recovery
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAction(isPaused ? onResume : onPause)}
              disabled={isActing}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isPaused
                  ? 'bg-[#00D084] hover:bg-[#00D084]/90 text-black border-[#00D084]'
                  : 'bg-[#161822] hover:bg-[#2A2D3E] text-[#F59E0B] border-[#F59E0B]/40'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Resume Processing' : 'Pause Queue'}</span>
            </button>

            <button
              onClick={() => handleAction(onSeedDemo)}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#6C63FF]/15 hover:bg-[#6C63FF]/25 border border-[#6C63FF]/30 text-[#6C63FF] hover:text-white transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Seed Demo (10 Leads)</span>
            </button>

            <button
              onClick={() => handleAction(onSimulateRateLimit)}
              disabled={isActing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 border border-[#F59E0B]/30 text-[#F59E0B] hover:text-white transition-all"
              title="Schedules 6 leads with limit=2 to trigger rate limit and alert Slack"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Test Rate Limit & Slack</span>
            </button>

            <button
              onClick={onRefresh}
              className="p-2 text-[#9CA3AF] hover:text-[#E5E7EB] bg-[#0F1117] border border-[#2A2D3E] rounded-xl hover:bg-[#2A2D3E] transition-colors"
              title="Refresh queue status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#6C63FF]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Real-time Metric Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-5 border-t border-[#2A2D3E]/80">
          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#3B82F6]" />
              Delayed in Queue
            </span>
            <span className="text-xl font-bold font-mono text-[#60A5FA] tabular-nums mt-1 block">
              {counts.inMemoryDelayed}
            </span>
          </div>

          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#6C63FF]" />
              Active Workers
            </span>
            <span className="text-xl font-bold font-mono text-[#E5E7EB] tabular-nums mt-1 block">
              {stats?.activeWorkers || 0} / {stats?.concurrency || 5}
            </span>
          </div>

          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-[#00D084]" />
              Delivered (Sent)
            </span>
            <span className="text-xl font-bold font-mono text-[#00D084] tabular-nums mt-1 block">
              {counts.sent}
            </span>
          </div>

          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-[#F59E0B]" />
              Rate Limited
            </span>
            <span className="text-xl font-bold font-mono text-[#F59E0B] tabular-nums mt-1 block">
              {counts.rateLimited}
            </span>
          </div>

          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <Gauge className="w-3 h-3 text-[#9CA3AF]" />
              Limiter Setting
            </span>
            <span className="text-sm font-semibold font-mono text-[#E5E7EB] tabular-nums mt-1.5 block">
              {stats?.jobsPerInterval || 10} / {Math.round((stats?.limiterIntervalMs || 1000) / 1000)}s
            </span>
          </div>

          <div className="bg-[#0F1117] p-3 rounded-xl border border-[#2A2D3E]">
            <span className="text-[11px] text-[#9CA3AF] flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#9CA3AF]" />
              Total Lifetime
            </span>
            <span className="text-xl font-bold font-mono text-[#E5E7EB] tabular-nums mt-1 block">
              {counts.total}
            </span>
          </div>
        </div>
      </div>

      {/* Two Columns: Hourly Sender Rate Limits & Live Queue Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Rate Limit Counters */}
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#F59E0B]" />
              <h3 className="text-xs font-bold text-[#E5E7EB] uppercase tracking-wider">
                Hourly Sender Counters (Redis)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#6B7280]">
              TTL: 1 hour window
            </span>
          </div>
          <p className="text-[11px] text-[#9CA3AF] mb-4">
            Atomic Redis counter per sender email. When limit is exceeded, counter rolls back, jobs defer to next hour, and Slack fires.
          </p>

          {rateLimitEntries.length === 0 ? (
            <div className="p-6 text-center bg-[#0F1117] rounded-xl border border-[#2A2D3E]/60 text-xs text-[#6B7280]">
              No active sender counters in current window. Schedule a campaign to initialize counters.
            </div>
          ) : (
            <div className="space-y-2.5">
              {rateLimitEntries.map(([key, count]) => {
                const parts = key.split(':');
                const sender = parts[1] || key;
                const windowKey = parts[2] || '';
                return (
                  <div
                    key={key}
                    className="p-3 bg-[#0F1117] rounded-xl border border-[#2A2D3E] flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-medium text-[#E5E7EB] truncate max-w-[180px]">
                        {sender}
                      </span>
                      <span className="text-xs font-mono font-bold text-[#00D084] tabular-nums">
                        {count} sent
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#6B7280]">
                      <span>Window: {windowKey}</span>
                      <span className="text-[#00D084]">Active Counter</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[#2A2D3E] flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">Clear all records & reset</span>
            <button
              onClick={() => handleAction(onReset)}
              className="text-[11px] text-[#EF4444] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Reset DB
            </button>
          </div>
        </div>

        {/* Right Column: Live Queue Activity Logs */}
        <div className="lg:col-span-2 bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#6C63FF]" />
              <h3 className="text-xs font-bold text-[#E5E7EB] uppercase tracking-wider">
                Live Queue Event Stream & Bull-Board Logs
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#9CA3AF]">
              {logs.length} logged events
            </span>
          </div>

          <div className="flex-1 bg-[#0F1117] rounded-xl border border-[#2A2D3E] overflow-hidden flex flex-col max-h-[380px]">
            <div className="overflow-y-auto p-3 space-y-2 text-xs font-mono">
              {logs.length === 0 ? (
                <div className="py-12 text-center text-[#6B7280]">
                  Queue worker ready. Event logs will appear in real time.
                </div>
              ) : (
                logs.map((log) => {
                  const levelClasses = {
                    info: 'text-[#60A5FA] bg-[#3B82F6]/10 border-[#3B82F6]/20',
                    warn: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/20',
                    error: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/20',
                    success: 'text-[#00D084] bg-[#00D084]/10 border-[#00D084]/20',
                  }[log.level];

                  const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="p-2 rounded-lg bg-[#161822] hover:bg-[#1f2230] border border-[#2A2D3E]/60 transition-colors cursor-pointer flex items-start gap-2.5"
                    >
                      <span className="text-[#6B7280] text-[10px] tabular-nums shrink-0 pt-0.5">
                        {timeStr}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-semibold uppercase tracking-wider border shrink-0 ${levelClasses}`}
                      >
                        {log.level}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[#E5E7EB] text-[11px] break-words">
                          {log.message}
                        </p>
                        {log.details && (
                          <div className="mt-1 text-[10px] text-[#9CA3AF] flex flex-wrap gap-2">
                            {Object.entries(log.details).map(([k, v]) => (
                              <span key={k} className="bg-[#0F1117] px-1.5 py-0.5 rounded">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
