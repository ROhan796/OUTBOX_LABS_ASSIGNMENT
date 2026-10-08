import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Papa from 'papaparse';
import {
  X,
  UploadCloud,
  Clock,
  Gauge,
  Send,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { SchedulePayload } from '../../../types/index.ts';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: SchedulePayload) => Promise<void>;
}

const SAMPLE_LEADS = [
  'alex.morgan@fintechpulse.io',
  'elena.rostova@cloudscale.co',
  'marcus.vance@growthpartners.com',
  'priya.patel@datastack.ai',
  'jordan.lee@venturelabs.net',
  'david.kim@saassprint.co',
  'claire.dupont@scaleapex.io',
  'zack.morris@reachinbox.test',
  'sarah.connor@cyberdyne.ai',
  'liam.chen@nexustech.org',
];

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const composeSchema = z.object({
  senderEmail: z
    .string()
    .min(3, 'Sender email is required.')
    .regex(EMAIL_PATTERN, 'Enter a valid sender email address.'),
  subject: z.string().min(3, 'Subject must be at least 3 characters.'),
  body: z.string().min(5, 'Body must be at least 5 characters.'),
  leads: z
    .array(z.string())
    .min(1, 'Please add at least 1 recipient lead.'),
  useCustomTime: z.boolean(),
  startTime: z.string().optional(),
  delaySeconds: z
    .number({ message: 'Delay must be a number.' })
    .min(1, 'Delay must be at least 1 second.')
    .max(300, 'Delay cannot exceed 300 seconds.'),
  hourlyLimit: z
    .number({ message: 'Hourly limit must be a number.' })
    .min(1, 'Hourly limit must be at least 1.')
    .max(10000, 'Hourly limit cannot exceed 10000.'),
});

type ComposeForm = z.input<typeof composeSchema>;

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [leadsInput, setLeadsInput] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ComposeForm>({
    resolver: zodResolver(composeSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      senderEmail: 'outreach@reachinbox.test',
      subject: 'Q4 Enterprise Cold Outreach & Partnership',
      body: `Hi {{firstName}},

I came across your work in outbound sales automation. We recently launched ReachInbox's new BullMQ-backed queue scheduler with per-sender hourly rate limiting and real Ethereal SMTP verification.

Would you be open to a 10-minute demo this Thursday?

Best regards,
Mukesh Mandal
ReachInbox Solutions`,
      leads: SAMPLE_LEADS,
      useCustomTime: false,
      startTime: '',
      delaySeconds: 2,
      hourlyLimit: 100,
    },
  });

  const leads = watch('leads');
  const useCustomTime = watch('useCustomTime');
  const delaySeconds = watch('delaySeconds');
  const rootError = errors.root?.message as string | undefined;

  const setLeads = (next: string[]) => setValue('leads', next, { shouldDirty: true, shouldValidate: true });

  // Close on ESC + lock background scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const parseFileContent = (file: File) => {
    setError('root', { message: '' });
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const extracted: string[] = [];

        if (results.data.length > 0 && typeof results.data[0] === 'object') {
          for (const row of results.data as Record<string, any>[]) {
            for (const key of Object.keys(row)) {
              const val = String(row[key] || '').trim();
              if (EMAIL_PATTERN.test(val)) {
                extracted.push(val.toLowerCase());
                break;
              }
            }
          }
        }

        if (extracted.length === 0) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = (e.target?.result as string) || '';
            const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (matches && matches.length > 0) {
              const unique = Array.from(new Set(matches.map((m) => m.toLowerCase())));
              setLeads(unique);
            } else {
              setError('root', { message: 'Could not find valid email addresses in the uploaded file.' });
            }
          };
          reader.readAsText(file);
          return;
        }

        const unique = Array.from(new Set(extracted));
        if (unique.length > 0) {
          setLeads(unique);
        } else {
          setError('root', { message: 'No valid email addresses detected in CSV.' });
        }
      },
      error: () => {
        setError('root', { message: 'Failed to parse CSV file. Please verify format.' });
      },
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFileContent(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFileContent(file);
  };

  const handleManualAdd = () => {
    if (!leadsInput.trim()) return;
    const matches = leadsInput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) {
      const merged = Array.from(new Set([...(leads || []), ...matches.map((m) => m.toLowerCase())]));
      setLeads(merged);
      setLeadsInput('');
    } else {
      setError('root', { message: 'Please enter valid email addresses separated by commas or lines.' });
    }
  };

  const submitHandler = handleSubmit(async (values) => {
    setError('root', { message: '' });

    if (values.useCustomTime && !values.startTime) {
      setError('root', { message: 'Pick a date/time for the custom schedule.' });
      return;
    }

    try {
      const scheduleTime =
        values.useCustomTime && values.startTime
          ? new Date(values.startTime).toISOString()
          : new Date().toISOString();

      await onSubmit({
        subject: values.subject.trim(),
        body: values.body.trim(),
        senderEmail: values.senderEmail.trim() || 'outreach@reachinbox.test',
        leads: values.leads,
        startTime: scheduleTime,
        delaySeconds: Math.max(1, values.delaySeconds),
        hourlyLimit: Math.max(1, values.hourlyLimit),
      });
      reset();
      onClose();
    } catch (err: any) {
      setError('root', { message: err.message || 'Failed to schedule campaign' });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-[#1A1D27] border border-[#2A2D3E] rounded-2xl shadow-2xl shadow-black/60 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#2A2D3E] flex items-center justify-between shrink-0 bg-[#161822]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#6C63FF]/15 border border-[#6C63FF]/30 flex items-center justify-center text-[#6C63FF]">
              <Send className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#E5E7EB] tracking-tight">
                Schedule New Email Campaign
              </h2>
              <p className="text-[11px] text-[#9CA3AF]">
                Delayed queue with staggered sequential sends and per-sender rate limiting
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

        {/* Scrollable Form Body */}
        <form onSubmit={submitHandler} noValidate className="p-6 overflow-y-auto space-y-5 text-xs text-[#E5E7EB]">
          {rootError && (
            <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl text-[#EF4444] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{rootError}</span>
            </div>
          )}

          {/* Sender & Subject */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Sender Email (Ethereal)
              </label>
              <input
                type="email"
                {...register('senderEmail')}
                placeholder="outreach@reachinbox.test"
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
              />
              {errors.senderEmail && (
                <p className="text-[10px] text-[#EF4444] mt-1">{errors.senderEmail.message}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Subject Line *
              </label>
              <input
                type="text"
                {...register('subject')}
                placeholder="e.g. Scaling outbound outreach with a delayed job queue"
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
              />
              {errors.subject && (
                <p className="text-[10px] text-[#EF4444] mt-1">{errors.subject.message}</p>
              )}
            </div>
          </div>

          {/* Body Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[#9CA3AF]">Email Body *</label>
              <span className="text-[11px] text-[#6B7280]">
                Supports HTML & variable tags like <code className="text-[#6C63FF]">{'{{firstName}}'}</code>
              </span>
            </div>
            <textarea
              rows={5}
              {...register('body')}
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl p-3 text-xs text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] font-mono leading-relaxed"
            />
            {errors.body && <p className="text-[10px] text-[#EF4444] mt-1">{errors.body.message}</p>}
          </div>

          {/* Lead List Upload Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#9CA3AF]">
                Recipient Leads ({leads?.length || 0} selected)
              </label>
              <button
                type="button"
                onClick={() => setLeads(SAMPLE_LEADS)}
                className="text-[11px] text-[#6C63FF] hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                Reset to 10 Sample Leads
              </button>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[#6C63FF] bg-[#6C63FF]/5'
                  : 'border-[#2A2D3E] hover:border-[#6C63FF]/50 bg-[#0F1117]/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <UploadCloud className="w-6 h-6 text-[#9CA3AF] mx-auto mb-1.5" />
              <p className="text-xs text-[#E5E7EB] font-medium">
                Click to upload or drag &amp; drop CSV file
              </p>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                Automatically extracts email addresses from columns or lines
              </p>
            </div>

            {/* Manual add */}
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={leadsInput}
                onChange={(e) => setLeadsInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualAdd();
                  }
                }}
                placeholder="paste emails, comma or newline separated"
                className="flex-1 bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-3 py-1.5 text-[11px] text-[#E5E7EB] placeholder-[#6B7280] focus:outline-none focus:border-[#6C63FF]"
              />
              <button
                type="button"
                onClick={handleManualAdd}
                className="px-3 py-1.5 text-[11px] font-semibold text-[#6C63FF] border border-[#6C63FF]/40 rounded-lg hover:bg-[#6C63FF]/10 transition-colors"
              >
                Add
              </button>
            </div>

            {errors.leads && (
              <p className="text-[10px] text-[#EF4444] mt-1">{errors.leads.message as string}</p>
            )}

            {/* Leads preview badge & sample list */}
            {(leads?.length || 0) > 0 && (
              <div className="mt-2.5 p-2.5 bg-[#0F1117] rounded-xl border border-[#2A2D3E] flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-[#9CA3AF]">
                  <span className="flex items-center gap-1.5 text-[#00D084]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{leads?.length} valid email addresses queued</span>
                  </span>
                  <button type="button" onClick={() => setLeads([])} className="text-[#EF4444] hover:underline">
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                  {(leads || []).slice(0, 8).map((email, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-[#1A1D27] border border-[#2A2D3E] rounded text-[10px] font-mono text-[#E5E7EB]"
                    >
                      {email}
                    </span>
                  ))}
                  {(leads?.length || 0) > 8 && (
                    <span className="px-2 py-0.5 bg-[#1A1D27] rounded text-[10px] text-[#9CA3AF]">
                      +{leads.length - 8} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Timing & Rate Limits */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#0F1117]/60 rounded-xl border border-[#2A2D3E]">
            {/* Start Time */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#9CA3AF] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[#6C63FF]" />
                  Start Time
                </label>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] cursor-pointer">
                  <input
                    type="radio"
                    name="startSchedule"
                    checked={!useCustomTime}
                    onChange={() => setValue('useCustomTime', false)}
                    className="text-[#6C63FF] focus:ring-0"
                  />
                  <span>Send Immediately</span>
                </label>
                <label className="flex items-center gap-1.5 text-[11px] text-[#9CA3AF] cursor-pointer">
                  <input
                    type="radio"
                    name="startSchedule"
                    checked={!!useCustomTime}
                    onChange={() => setValue('useCustomTime', true)}
                    className="text-[#6C63FF] focus:ring-0"
                  />
                  <span>Custom Schedule</span>
                </label>
                {useCustomTime && (
                  <input
                    type="datetime-local"
                    {...register('startTime')}
                    className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-2.5 py-1 text-xs text-[#E5E7EB] mt-1"
                  />
                )}
              </div>
            </div>

            {/* Delay Between Emails */}
            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">
                Delay Between Emails (sec)
              </label>
              <input
                type="number"
                min={1}
                max={300}
                {...register('delaySeconds', { valueAsNumber: true })}
                className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6C63FF]"
              />
              <p className="text-[10px] text-[#6B7280] mt-1">
                Min 1s. Staggers jobs sequentially.
              </p>
              {errors.delaySeconds && (
                <p className="text-[10px] text-[#EF4444] mt-1">{errors.delaySeconds.message as string}</p>
              )}
            </div>

            {/* Hourly Rate Limit */}
            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5 flex items-center gap-1">
                <Gauge className="w-3 h-3 text-[#F59E0B]" />
                Hourly Sender Limit
              </label>
              <input
                type="number"
                min={1}
                max={10000}
                {...register('hourlyLimit', { valueAsNumber: true })}
                className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6C63FF]"
              />
              <p className="text-[10px] text-[#6B7280] mt-1">
                Triggers Slack notification & defers to next hour window.
              </p>
              {errors.hourlyLimit && (
                <p className="text-[10px] text-[#EF4444] mt-1">{errors.hourlyLimit.message as string}</p>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#2A2D3E] flex items-center justify-between">
            <span className="text-[11px] text-[#9CA3AF]">
              Estimated campaign duration:{' '}
              <strong className="text-[#E5E7EB] tabular-nums">
                {Math.round(((leads?.length || 0) * (delaySeconds || 0)) / 60)} min
              </strong>
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#9CA3AF] hover:text-[#E5E7EB] hover:bg-[#2A2D3E]/40 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (leads?.length || 0) === 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#6C63FF] hover:bg-[#5A52E0] disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md shadow-[#6C63FF]/30 transition-all duration-150 active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Enqueuing Jobs...' : 'Schedule Campaign →'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
