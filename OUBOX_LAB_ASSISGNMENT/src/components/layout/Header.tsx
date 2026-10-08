import React from 'react';
import { User } from '../../types/index.ts';
import { SlackStatus } from '../../api/slack.api.ts';
import {
  Send,
  Plus,
  Radio,
  Hash,
  LogOut,
  Sparkles,
  Inbox,
  Clock,
  Activity,
} from 'lucide-react';

interface HeaderProps {
  user: User | null;
  slackStatus: SlackStatus | null;
  activeTab: 'scheduled' | 'sent' | 'queue' | 'slack';
  setActiveTab: (tab: 'scheduled' | 'sent' | 'queue' | 'slack') => void;
  onOpenCompose: () => void;
  onOpenSlackModal: () => void;
  onLogout: () => void;
  counts: { scheduled: number; sent: number; rateLimited: number };
}

export const Header: React.FC<HeaderProps> = ({
  user,
  slackStatus,
  activeTab,
  setActiveTab,
  onOpenCompose,
  onOpenSlackModal,
  onLogout,
  counts,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#1A1D27]/95 backdrop-blur-md border-b border-[#2A2D3E]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C63FF] to-[#5A52E0] flex items-center justify-center shadow-sm shadow-[#6C63FF]/20">
            <Send className="w-4 h-4 text-white -rotate-12 translate-x-[-1px] translate-y-[1px]" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-[#E5E7EB] font-sans flex items-center gap-2">
              ReachInbox
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-[#6C63FF]/15 text-[#6C63FF] border border-[#6C63FF]/30">
                Scheduler
              </span>
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links / Segmented Control */}
        <nav className="hidden md:flex items-center gap-1 bg-[#0F1117] p-1 rounded-xl border border-[#2A2D3E]">
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'scheduled'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1A1D27]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Scheduled</span>
            {counts.scheduled > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/20 text-white tabular-nums">
                {counts.scheduled}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'sent'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1A1D27]'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Sent</span>
            {counts.sent > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-white/20 text-white tabular-nums">
                {counts.sent}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'queue'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1A1D27]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Queue Engine</span>
            {counts.rateLimited > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 tabular-nums">
                {counts.rateLimited} limited
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('slack')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'slack'
                ? 'bg-[#6C63FF] text-white shadow-sm'
                : 'text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#1A1D27]'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Slack Alerts</span>
          </button>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-3">
          {/* Slack Status / Toggle button */}
          <button
            onClick={onOpenSlackModal}
            className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              slackStatus?.connected
                ? 'bg-[#00D084]/10 border-[#00D084]/30 text-[#00D084] hover:bg-[#00D084]/20'
                : 'bg-[#0F1117] border-[#2A2D3E] text-[#9CA3AF] hover:text-[#E5E7EB] hover:border-[#6C63FF]/50'
            }`}
            title="Configure Slack Webhooks and OAuth notifications"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                slackStatus?.connected ? 'bg-[#00D084] animate-pulse' : 'bg-[#6B7280]'
              }`}
            />
            <span className="hidden sm:inline">
              {slackStatus?.connected ? 'Slack Connected' : 'Connect Slack'}
            </span>
          </button>

          {/* User Profile */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-[#2A2D3E]">
            <img
              src={user?.avatarUrl || '/src/assets/images/avatar_executive_user_1791228537474.jpg'}
              alt={user?.name || 'User avatar'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover ring-1 ring-[#2A2D3E]"
            />
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-[#E5E7EB] leading-tight">
                {user?.name || 'Mukesh Mandal'}
              </span>
              <span className="text-[11px] text-[#9CA3AF] font-mono leading-tight truncate max-w-[130px]">
                {user?.email || 'mukesh@reachinbox.ai'}
              </span>
            </div>
            <button
              onClick={onLogout}
              title="Logout session"
              className="p-1.5 text-[#9CA3AF] hover:text-[#EF4444] hover:bg-[#0F1117] rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Hero Compose Button */}
          <button
            onClick={onOpenCompose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#6C63FF] hover:bg-[#5A52E0] text-white text-xs font-semibold rounded-lg shadow-sm shadow-[#6C63FF]/30 transition-all duration-150 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Compose</span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex items-center justify-around border-t border-[#2A2D3E] bg-[#0F1117] px-2 py-1.5 text-xs">
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            activeTab === 'scheduled' ? 'text-[#6C63FF] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Scheduled ({counts.scheduled})</span>
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            activeTab === 'sent' ? 'text-[#6C63FF] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Sent ({counts.sent})</span>
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            activeTab === 'queue' ? 'text-[#6C63FF] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Queue</span>
        </button>
        <button
          onClick={() => setActiveTab('slack')}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${
            activeTab === 'slack' ? 'text-[#6C63FF] font-semibold' : 'text-[#9CA3AF]'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>Alerts</span>
        </button>
      </div>
    </header>
  );
};
