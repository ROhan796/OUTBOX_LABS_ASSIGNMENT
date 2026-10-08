import React, { useState } from 'react';
import { Send, Sparkles, ShieldCheck, Mail, ArrowRight } from 'lucide-react';

interface LoginPageProps {
  onDemoLogin: (email: string, name: string) => Promise<void>;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onDemoLogin }) => {
  const [emailInput, setEmailInput] = useState('mukeshkumarmandal799736372@gmail.com');
  const [nameInput, setNameInput] = useState('Mukesh Mandal');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await onDemoLogin(emailInput, nameInput);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background subtle glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#6C63FF]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] p-8 sm:p-10 shadow-2xl relative z-10">
        {/* Brand Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#5A52E0] flex items-center justify-center shadow-lg shadow-[#6C63FF]/30 mb-4">
            <Send className="w-6 h-6 text-white -rotate-12 translate-x-[-1px] translate-y-[1px]" />
          </div>
          <h1 className="text-xl font-bold text-[#E5E7EB] tracking-tight">
            ReachInbox Scheduler
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1.5">
            Production-grade cold email job queue & rate limiter
          </p>
        </div>

        {/* Google OAuth Button */}
        <div className="space-y-4">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full bg-white text-gray-900 font-semibold text-xs rounded-xl px-4 py-3 hover:bg-gray-100 transition-all duration-150 shadow-md shadow-black/20"
          >
            {/* Google SVG Icon */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google OAuth</span>
          </a>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-[#2A2D3E]" />
            <span className="flex-shrink mx-3 text-[10px] uppercase font-mono text-[#6B7280]">
              or quick demo access
            </span>
            <div className="flex-grow border-t border-[#2A2D3E]" />
          </div>

          {/* Quick Demo Login Form */}
          <form onSubmit={handleDemoSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                Account Email
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6C63FF]"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#9CA3AF] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-xl px-3 py-2 text-xs text-[#E5E7EB] focus:outline-none focus:border-[#6C63FF]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#6C63FF] hover:bg-[#5A52E0] text-white text-xs font-semibold rounded-xl shadow-md shadow-[#6C63FF]/25 transition-all duration-150 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLoggingIn ? 'Entering Dashboard...' : 'Enter Dashboard Directly →'}</span>
            </button>
          </form>
        </div>

        {/* Feature Highlights */}
        <div className="mt-8 pt-6 border-t border-[#2A2D3E] space-y-2 text-[11px] text-[#9CA3AF]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00D084]" />
            <span>BullMQ delayed queue & Redis per-sender counters</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-[#00D084]" />
            <span>Real Ethereal fake SMTP delivery with web preview URLs</span>
          </div>
          <div className="flex items-center gap-2">
            <Send className="w-3.5 h-3.5 text-[#00D084]" />
            <span>Live Slack rate limit notifications & boot-time recovery</span>
          </div>
        </div>
      </div>
    </div>
  );
};
