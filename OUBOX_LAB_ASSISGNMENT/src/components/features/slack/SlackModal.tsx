import React, { useState } from 'react';
import { SlackStatus } from '../../../api/slack.api.ts';
import {
  X,
  Hash,
  Send,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  slackStatus: SlackStatus | null;
  onDisconnect: () => Promise<void>;
  onSaveWebhook: (webhookUrl: string, channel: string) => Promise<void>;
  onSendTestAlert: (msg?: string) => Promise<{ success: boolean; message: string }>;
}

export const SlackModal: React.FC<SlackModalProps> = ({
  isOpen,
  onClose,
  slackStatus,
  onDisconnect,
  onSaveWebhook,
  onSendTestAlert,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channel, setChannel] = useState(slackStatus?.channel || '#rate-limit-alerts');
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveWebhook(webhookUrl, channel);
      setTestResult({ success: true, message: 'Slack configuration updated successfully.' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Failed to save configuration.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onSendTestAlert();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test delivery failed' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2A2D3E] flex items-center justify-between bg-[#161822]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#00D084]/15 border border-[#00D084]/30 flex items-center justify-center text-[#00D084]">
              <Hash className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#E5E7EB] tracking-tight">
                Slack Rate Limit Alerts
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Receive instant notifications when any sender exceeds their hourly threshold
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#9CA3AF] hover:text-[#E5E7EB] p-1.5 rounded-lg hover:bg-[#2A2D3E]/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-[#E5E7EB]">
          {/* Status Card */}
          <div className="p-4 bg-[#0F1117] rounded-xl border border-[#2A2D3E] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className={`w-3 h-3 rounded-full ${
                  slackStatus?.connected ? 'bg-[#00D084] shadow-sm shadow-[#00D084]/40' : 'bg-[#6B7280]'
                }`}
              />
              <div>
                <p className="font-semibold text-xs text-[#E5E7EB]">
                  {slackStatus?.connected ? 'Workspace Connected' : 'Slack Not Connected'}
                </p>
                <p className="text-[11px] text-[#9CA3AF]">
                  Target Channel: <span className="font-mono text-[#6C63FF]">{slackStatus?.channel || '#email-alerts'}</span>
                </p>
              </div>
            </div>

            {slackStatus?.connected ? (
              <button
                onClick={onDisconnect}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 border border-[#EF4444]/30 text-[#EF4444] rounded-lg text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            ) : (
              <a
                href="/api/slack/authorize"
                className="flex items-center gap-1 px-3 py-1.5 bg-[#6C63FF] hover:bg-[#5A52E0] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <span>OAuth Connect</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Incoming Webhook Configuration */}
          <form onSubmit={handleSave} className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#9CA3AF]">
                Custom Slack Incoming Webhook URL
              </label>
              <span className="text-[10px] text-[#6B7280]">
                Optional: direct webhook integration
              </span>
            </div>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/T00/B00/XXXXX"
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF]"
            />

            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1">
                Channel Name
              </label>
              <input
                type="text"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="#rate-limit-alerts"
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 bg-[#1A1D27] hover:bg-[#2A2D3E] border border-[#2A2D3E] text-[#E5E7EB] rounded-lg text-xs font-medium transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>

          {/* Test Alert Button */}
          <div className="p-4 bg-[#0F1117]/60 rounded-xl border border-[#2A2D3E] flex items-center justify-between">
            <div>
              <p className="font-medium text-xs text-[#E5E7EB]">
                Test Rate Limit Alert
              </p>
              <p className="text-[11px] text-[#9CA3AF]">
                Dispatch a simulation payload to verify your Slack alert delivery
              </p>
            </div>
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6C63FF] hover:bg-[#5A52E0] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTesting ? 'Sending...' : 'Send Test Alert'}</span>
            </button>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.success
                  ? 'bg-[#00D084]/10 border-[#00D084]/30 text-[#00D084]'
                  : 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444]'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#161822] border-t border-[#2A2D3E] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#6C63FF] hover:bg-[#5A52E0] text-white text-xs font-semibold rounded-xl transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
