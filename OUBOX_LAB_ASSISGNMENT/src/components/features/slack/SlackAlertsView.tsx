import React from 'react';
import { SlackAlert } from '../../../types/index.ts';
import { SlackStatus } from '../../../api/slack.api.ts';
import {
  Hash,
  AlertTriangle,
  Send,
  ExternalLink,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from 'lucide-react';

interface SlackAlertsViewProps {
  alerts: SlackAlert[];
  slackStatus: SlackStatus | null;
  onOpenSlackModal: () => void;
  onSendTestAlert: () => Promise<{ success: boolean; message: string }>;
}

export const SlackAlertsView: React.FC<SlackAlertsViewProps> = ({
  alerts,
  slackStatus,
  onOpenSlackModal,
  onSendTestAlert,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00D084]/15 border border-[#00D084]/30 flex items-center justify-center text-[#00D084]">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#E5E7EB] tracking-tight">
              Slack Rate Limit Alert Feed
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Live broadcast channel: <code className="text-[#6C63FF] font-mono">{slackStatus?.channel || '#email-alerts'}</code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onSendTestAlert()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6C63FF]/15 hover:bg-[#6C63FF]/25 border border-[#6C63FF]/30 text-[#6C63FF] hover:text-white rounded-xl text-xs font-semibold transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send Test Alert</span>
          </button>
          <button
            onClick={onOpenSlackModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#6C63FF] hover:bg-[#5A52E0] text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <span>Configure Slack</span>
          </button>
        </div>
      </div>

      {/* Alerts Stream List */}
      <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl p-5 shadow-sm">
        <h3 className="text-xs font-bold text-[#E5E7EB] uppercase tracking-wider mb-4 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#F59E0B]" />
          <span>Recent Rate Limit Event Dispatches ({alerts.length})</span>
        </h3>

        {alerts.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#6B7280] bg-[#0F1117] rounded-xl border border-[#2A2D3E]/60">
            No rate limit alerts recorded yet. Click "Send Test Alert" or test with our rate limit burst button in the Queue tab.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 bg-[#0F1117] rounded-xl border border-[#2A2D3E] flex flex-col md:flex-row md:items-start justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/30">
                      <AlertTriangle className="w-3 h-3" />
                      Rate Limit Exceeded
                    </span>
                    <span className="text-xs font-mono font-medium text-[#E5E7EB]">
                      {alert.sender_email}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">·</span>
                    <span className="text-[11px] text-[#9CA3AF]">
                      Limit: <strong className="text-[#E5E7EB]">{alert.hourly_limit}/hr</strong>
                    </span>
                  </div>

                  <p className="text-xs text-[#9CA3AF] whitespace-pre-line font-mono bg-[#161822] p-2.5 rounded-lg border border-[#2A2D3E]/50">
                    {alert.message}
                  </p>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between shrink-0 text-right gap-1 text-[11px] text-[#6B7280]">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(alert.triggered_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className="text-[10px] font-mono text-[#6C63FF]">
                    {alert.channel || '#email-alerts'}
                  </span>
                  <span className="text-[10px] text-[#00D084] flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {alert.success ? 'Delivered to Slack' : 'Logged locally'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
