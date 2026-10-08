import React from 'react';
import { Send } from 'lucide-react';

interface SpinnerProps {
  label?: string;
}

/** Full-screen loading splash used while the auth session resolves. */
export const Spinner: React.FC<SpinnerProps> = ({
  label = 'Initializing ReachInbox Queue Engine...',
}) => (
  <div className="min-h-screen bg-[#0F1117] flex flex-col items-center justify-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#5A52E0] flex items-center justify-center shadow-lg shadow-[#6C63FF]/30 animate-pulse">
      <Send className="w-5 h-5 text-white -rotate-12 translate-x-[-1px] translate-y-[1px]" />
    </div>
    <p className="text-xs font-mono text-[#9CA3AF]">{label}</p>
  </div>
);

/** Inline block spinner for table bodies and panels. */
export const InlineSpinner: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="flex items-center gap-2 text-[#9CA3AF] text-xs py-8 justify-center">
    <div className="w-4 h-4 border-2 border-[#2A2D3E] border-t-[#6C63FF] rounded-full animate-spin" />
    <span>{label}</span>
  </div>
);

export default Spinner;
