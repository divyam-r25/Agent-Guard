import { Shield, Activity, Radio, Zap, ShieldCheck, ShieldX } from 'lucide-react';

interface HeaderProps {
  paymentProvider?: string;
  isConnected?: boolean;
  stats?: {
    decisions: number;
    blocked: number;
    injections: number;
  };
}

export function Header({ paymentProvider, isConnected, stats }: HeaderProps) {
  return (
    <header className="glass-panel px-5 py-3 flex items-center justify-between">
      {/* Logo + title */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-600/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-allow-500 rounded-full border-2 border-surface-900 animate-pulse" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2.5">
            AgentGuard
            <span className="badge-info text-[9px] py-0.5">PROTOTYPE</span>
          </h1>
          <p className="text-[11px] text-gray-500 font-medium">Agentic Transaction Trust Layer · Razorpay AI Buildathon 2026</p>
        </div>
      </div>

      {/* Center — stats bar (if available) */}
      {stats && stats.decisions > 0 && (
        <div className="hidden lg:flex items-center gap-5">
          <StatPill icon={Activity} label="Decisions" value={stats.decisions} color="text-brand-400" />
          <StatPill icon={ShieldX} label="Blocked" value={stats.blocked} color="text-block-400" />
          <StatPill icon={Zap} label="Injections" value={stats.injections} color="text-stepup-400" />
        </div>
      )}

      {/* Right — connection info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-allow-400" />
          <span className="text-gray-500 text-[11px]">Pre-payment enforcement active</span>
        </div>
        <div className="h-4 w-px bg-surface-700" />
        <div className="flex items-center gap-2">
          <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-allow-500 animate-pulse' : 'text-gray-600'}`} />
          <span className="text-[11px] text-gray-400">
            {isConnected ? (paymentProvider || 'Mock Provider') : 'Offline'}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatPill({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-800/60 border border-white/[0.05]">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <div>
        <p className="text-xs font-bold text-white leading-none">{value}</p>
        <p className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}
