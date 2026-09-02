import { Zap, ShoppingCart, Bug, TrendingUp, Store, MapPin, RotateCcw, Loader2, Sparkles } from 'lucide-react';

interface AttackLabProps {
  onRunScenario: (scenarioId: string) => void;
  activeScenario: string | null;
  isLoading: boolean;
  onReset: () => void;
}

const SCENARIOS = [
  {
    id: 'scenario_a',
    name: 'Clean Purchase',
    description: '₹2,799 running shoes — ALLOW',
    icon: ShoppingCart,
    color: 'text-allow-400',
    bgColor: 'bg-allow-500/8',
    borderHover: 'hover:border-allow-500/40',
    expectedBadge: 'badge-allow',
    expected: 'ALLOW',
  },
  {
    id: 'scenario_b',
    name: 'Catalog Injection',
    description: 'Prompt injection in product data',
    icon: Bug,
    color: 'text-brand-400',
    bgColor: 'bg-brand-500/8',
    borderHover: 'hover:border-brand-500/40',
    expectedBadge: 'badge-info',
    expected: 'DETECT',
  },
  {
    id: 'scenario_c',
    name: 'Transaction Mutation',
    description: '₹11,899 / qty 4 vs ₹3k / 1 — BLOCK',
    icon: Zap,
    color: 'text-block-400',
    bgColor: 'bg-block-500/8',
    borderHover: 'hover:border-block-500/40',
    expectedBadge: 'badge-block',
    expected: 'BLOCK',
  },
  {
    id: 'scenario_d',
    name: 'Borderline Amount',
    description: '₹5,400 vs ₹5,000 limit — STEP-UP',
    icon: TrendingUp,
    color: 'text-stepup-400',
    bgColor: 'bg-stepup-500/8',
    borderHover: 'hover:border-stepup-500/40',
    expectedBadge: 'badge-stepup',
    expected: 'STEP-UP',
  },
  {
    id: 'scenario_e',
    name: 'Merchant Switch',
    description: 'Unauthorized merchant substitution',
    icon: Store,
    color: 'text-block-400',
    bgColor: 'bg-block-500/8',
    borderHover: 'hover:border-block-500/40',
    expectedBadge: 'badge-block',
    expected: 'BLOCK',
  },
  {
    id: 'scenario_f',
    name: 'Address Mutation',
    description: 'Shipping redirected to unknown address',
    icon: MapPin,
    color: 'text-block-400',
    bgColor: 'bg-block-500/8',
    borderHover: 'hover:border-block-500/40',
    expectedBadge: 'badge-block',
    expected: 'BLOCK',
  },
];

export function AttackLab({ onRunScenario, activeScenario, isLoading, onReset }: AttackLabProps) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-stepup-500/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-stepup-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Attack Lab</h2>
            <p className="text-[10px] text-gray-500">6 security scenarios</p>
          </div>
        </div>
        <button
          onClick={onReset}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors disabled:opacity-40 px-3 py-1.5 rounded-lg hover:bg-surface-800/60"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-6 gap-2">
        {SCENARIOS.map((s) => {
          const Icon = s.icon;
          const isActive = activeScenario === s.id;

          return (
            <button
              key={s.id}
              onClick={() => onRunScenario(s.id)}
              disabled={isLoading}
              className={`
                relative flex flex-col items-center gap-1.5 py-3 px-2
                rounded-xl border transition-all duration-200
                active:scale-[0.97] disabled:cursor-not-allowed
                ${isActive
                  ? `border-brand-500/50 ${s.bgColor} shadow-lg shadow-brand-500/10`
                  : `border-white/[0.06] bg-surface-800/60 ${s.borderHover} hover:bg-surface-700/60`
                }
              `}
            >
              {/* Loading overlay */}
              {isLoading && isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-surface-900/70 rounded-xl z-10">
                  <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />
                </div>
              )}

              {/* Active indicator */}
              {isActive && !isLoading && (
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
              )}

              <Icon className={`w-5 h-5 ${s.color} ${isLoading && !isActive ? 'opacity-40' : ''}`} />
              <span className="text-[10px] font-semibold text-gray-200 leading-tight text-center">{s.name}</span>
              <span className="text-[9px] text-gray-500 text-center leading-tight">{s.description}</span>
              <span className={s.expectedBadge} style={{ fontSize: '8px', padding: '1px 6px' }}>{s.expected}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
