import React, { useState } from 'react';
import { EmailJob } from '../../../types/index.ts';
import {
  Search,
  Clock,
  AlertTriangle,
  RotateCw,
  Mail,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface ScheduledEmailsTableProps {
  jobs: EmailJob[];
  isLoading: boolean;
  total: number;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  onSearch: (query: string) => void;
  onRetry: (jobId: string) => Promise<void>;
  onOpenCompose: () => void;
}

export const ScheduledEmailsTable: React.FC<ScheduledEmailsTableProps> = ({
  jobs,
  isLoading,
  total,
  page,
  limit,
  onPageChange,
  onSearch,
  onRetry,
  onOpenCompose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'rate_limited'>('all');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    onSearch(val);
  };

  const handleRetryClick = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await onRetry(jobId);
    } finally {
      setRetryingId(null);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'all') return true;
    return job.status === statusFilter;
  });

  const totalPages = Math.ceil(total / limit) || 1;

  const formatScheduledTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = Date.now();
      const diffMs = date.getTime() - now;

      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

      if (diffMs > 0) {
        const diffSec = Math.round(diffMs / 1000);
        if (diffSec < 60) return `in ${diffSec}s · ${timeStr}`;
        const diffMin = Math.round(diffSec / 60);
        if (diffMin < 60) return `in ${diffMin}m · ${timeStr}`;
        const diffHr = Math.round(diffMin / 60);
        return `in ${diffHr}h · ${dateStr}, ${timeStr}`;
      }
      return `${dateStr}, ${timeStr} (ready)`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Controls: Search + Status Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search recipient, subject, campaign, or match keyword..."
            className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-xl pl-9 pr-4 py-2 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
          />
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 bg-[#1A1D27] border border-[#2A2D3E] p-1 rounded-xl shrink-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            All ({jobs.length})
          </button>
          <button
            onClick={() => setStatusFilter('scheduled')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'scheduled'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB]'
            }`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setStatusFilter('rate_limited')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'rate_limited'
                ? 'bg-[#F59E0B] text-black font-semibold shadow-sm'
                : 'text-[#F59E0B] hover:text-[#F59E0B]/80'
            }`}
          >
            Rate Limited
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#2A2D3E] bg-[#161822]/80 text-[#9CA3AF]">
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Recipient Lead
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Subject Line
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Scheduled For
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Queue Status
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Campaign
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px] text-right">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#2A2D3E]/60 text-[#E5E7EB]">
              {isLoading ? (
                // Skeletons
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4">
                      <div className="h-4 w-40 bg-[#2A2D3E] rounded" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-52 bg-[#2A2D3E] rounded" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-28 bg-[#2A2D3E] rounded" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-5 w-20 bg-[#2A2D3E] rounded-full" />
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-4 w-24 bg-[#2A2D3E] rounded" />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="h-6 w-16 bg-[#2A2D3E] rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#0F1117] border border-[#2A2D3E] flex items-center justify-center text-[#6B7280]">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-[#E5E7EB]">
                          {searchQuery ? 'No matching scheduled jobs' : 'No scheduled emails in queue'}
                        </p>
                        <p className="text-xs text-[#9CA3AF] max-w-sm mt-0.5">
                          {searchQuery
                            ? 'Try clearing the search query or changing your filter.'
                            : 'Upload leads via CSV or use our pre-built sample batch to initiate the scheduler.'}
                        </p>
                      </div>
                      {!searchQuery && (
                        <button
                          onClick={onOpenCompose}
                          className="mt-2 px-4 py-2 bg-[#6C63FF] hover:bg-[#5A52E0] text-white text-xs font-semibold rounded-xl transition-all"
                        >
                          Schedule Campaign Now
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-[#222533]/50 transition-colors group"
                  >
                    {/* Recipient */}
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[#E5E7EB]">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[200px]" title={job.recipientEmail}>
                          {job.recipientEmail}
                        </span>
                        {job.matchReason && (
                          <span className="text-[9px] font-sans px-1.5 py-0.2 bg-[#6C63FF]/20 text-[#6C63FF] rounded border border-[#6C63FF]/30">
                            matched {job.matchReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Subject */}
                    <td className="px-5 py-3.5 max-w-[260px] truncate text-[#E5E7EB]" title={job.subject}>
                      {job.subject}
                    </td>

                    {/* Scheduled At */}
                    <td className="px-5 py-3.5 text-[#9CA3AF] tabular-nums whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#6C63FF]" />
                        <span>{formatScheduledTime(job.scheduledAt)}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {job.status === 'scheduled' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#3B82F6]/10 text-[#60A5FA] border border-[#3B82F6]/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
                          <span>Scheduled</span>
                        </span>
                      ) : (
                        <div className="inline-flex flex-col">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
                            <AlertTriangle className="w-3 h-3 text-[#F59E0B]" />
                            <span>Rate Limited</span>
                          </span>
                          {job.errorMessage && (
                            <span
                              className="text-[9px] text-[#F59E0B]/80 mt-0.5 truncate max-w-[170px]"
                              title={job.errorMessage}
                            >
                              Deferred to next hour
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Campaign */}
                    <td className="px-5 py-3.5 text-[#9CA3AF] max-w-[140px] truncate" title={job.campaignTitle}>
                      {job.campaignTitle}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleRetryClick(job.id)}
                        disabled={retryingId === job.id}
                        title="Expedite or re-enqueue job immediately"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F1117] hover:bg-[#2A2D3E] border border-[#2A2D3E] text-[#9CA3AF] hover:text-[#E5E7EB] text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        <RotateCw
                          className={`w-3 h-3 ${retryingId === job.id ? 'animate-spin text-[#6C63FF]' : ''}`}
                        />
                        <span>Send Now</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {total > limit && (
          <div className="px-5 py-3 bg-[#161822] border-t border-[#2A2D3E] flex items-center justify-between text-xs text-[#9CA3AF]">
            <span className="tabular-nums">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} jobs
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-[#2A2D3E] bg-[#1A1D27] text-[#E5E7EB] hover:bg-[#2A2D3E] disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono px-2 text-[#E5E7EB]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-[#2A2D3E] bg-[#1A1D27] text-[#E5E7EB] hover:bg-[#2A2D3E] disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
