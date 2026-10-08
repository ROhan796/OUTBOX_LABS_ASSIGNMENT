import React, { useState } from 'react';
import { EmailJob } from '../../../types/index.ts';
import {
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Mail,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RotateCw,
} from 'lucide-react';

interface SentEmailsTableProps {
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

export const SentEmailsTable: React.FC<SentEmailsTableProps> = ({
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const handleRetryClick = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await onRetry(jobId);
    } finally {
      setRetryingId(null);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    onSearch(val);
  };

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'all') return true;
    return job.status === statusFilter;
  });

  const totalPages = Math.ceil(total / limit) || 1;

  const formatSentTime = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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
            placeholder="Search sent recipient, subject, preview link, or match..."
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
            All Sent ({jobs.length})
          </button>
          <button
            onClick={() => setStatusFilter('sent')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'sent'
                ? 'bg-[#00D084] text-black font-semibold shadow-sm'
                : 'text-[#00D084] hover:text-[#00D084]/80'
            }`}
          >
            Delivered
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === 'failed'
                ? 'bg-[#EF4444] text-white font-semibold shadow-sm'
                : 'text-[#EF4444] hover:text-[#EF4444]/80'
            }`}
          >
            Failed
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
                  Delivered At
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px]">
                  Delivery Status
                </th>
                <th className="px-5 py-3.5 font-semibold uppercase tracking-wider text-[11px] text-right">
                  Ethereal SMTP Inbox
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#2A2D3E]/60 text-[#E5E7EB]">
              {isLoading ? (
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
                    <td className="px-5 py-4 text-right">
                      <div className="h-6 w-24 bg-[#2A2D3E] rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#0F1117] border border-[#2A2D3E] flex items-center justify-center text-[#6B7280]">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-[#E5E7EB]">
                          {searchQuery ? 'No matching sent emails found' : 'No emails have been sent yet'}
                        </p>
                        <p className="text-xs text-[#9CA3AF] max-w-sm mt-0.5">
                          {searchQuery
                            ? 'Try clearing the search query or changing filters.'
                            : 'When scheduled jobs execute, their Ethereal web inbox links will appear here.'}
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
                    <td className="px-5 py-3.5 max-w-[280px] truncate text-[#E5E7EB]" title={job.subject}>
                      {job.subject}
                    </td>

                    {/* Delivered At */}
                    <td className="px-5 py-3.5 text-[#9CA3AF] tabular-nums whitespace-nowrap">
                      {formatSentTime(job.sentAt)}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {job.status === 'sent' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#00D084]/10 text-[#00D084] border border-[#00D084]/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00D084]" />
                          <span>Sent via Ethereal</span>
                        </span>
                      ) : (
                        <div className="inline-flex flex-col">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20">
                            <XCircle className="w-3.5 h-3.5 text-[#EF4444]" />
                            <span>Delivery Failed</span>
                          </span>
                          {job.errorMessage && (
                            <span className="text-[9px] text-[#EF4444]/80 mt-0.5 max-w-[180px] truncate" title={job.errorMessage}>
                              {job.errorMessage}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Preview URL / Retry */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      {job.status === 'failed' ? (
                        <button
                          onClick={() => handleRetryClick(job.id)}
                          disabled={retryingId === job.id}
                          title="Re-enqueue this failed job immediately"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 text-[#EF4444] text-[11px] font-medium transition-colors disabled:opacity-50"
                        >
                          <RotateCw
                            className={`w-3 h-3 ${retryingId === job.id ? 'animate-spin' : ''}`}
                          />
                          <span>{retryingId === job.id ? 'Re-enqueuing...' : 'Retry Send'}</span>
                        </button>
                      ) : job.etherealPreviewUrl ? (
                        <a
                          href={job.etherealPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6C63FF]/15 hover:bg-[#6C63FF]/25 border border-[#6C63FF]/30 text-[#6C63FF] hover:text-white text-[11px] font-medium transition-colors"
                        >
                          <span>View Web Preview</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#6B7280] text-[11px] italic">No preview link</span>
                      )}
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
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} sent emails
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
