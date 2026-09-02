import { useState, type FormEvent } from 'react';
import { Send, Bot, User, Wrench, Search, Package, Loader2, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import type { AppPhase } from '../hooks/useAgentGuard';

interface ChatPanelProps {
  phase: AppPhase;
  userMessage: string;
  agentState: any | null;
  intentContract: any | null;
  sessionId: string | null;
  isLoading: boolean;
  onSubmit: (message: string) => void;
}

function BudgetTypeBadge({ budgetType }: { budgetType?: string }) {
  if (!budgetType) return null;
  const configs: Record<string, { label: string; cls: string }> = {
    exact:       { label: 'Hard Limit', cls: 'bg-allow-500/15 text-allow-400 border border-allow-500/20' },
    approximate: { label: 'Soft Estimate', cls: 'bg-stepup-500/15 text-stepup-400 border border-stepup-500/20' },
    unknown:     { label: 'No Budget', cls: 'bg-block-500/15 text-block-400 border border-block-500/20' },
  };
  const cfg = configs[budgetType] || configs.unknown;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function CertaintyBadge({ certainty }: { certainty?: string }) {
  if (!certainty) return null;
  const configs: Record<string, { label: string; icon: any; cls: string }> = {
    high:   { label: 'High Certainty', icon: CheckCircle, cls: 'text-allow-400' },
    medium: { label: 'Medium', icon: TrendingUp, cls: 'text-stepup-400' },
    low:    { label: 'Low', icon: AlertCircle, cls: 'text-stepup-500' },
    none:   { label: 'No Authorization', icon: AlertCircle, cls: 'text-block-400' },
  };
  const cfg = configs[certainty] || configs.none;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${cfg.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </span>
  );
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-allow-500' : pct >= 50 ? 'bg-stepup-500' : 'bg-block-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <span className="text-[9px] text-gray-600 uppercase">{label}</span>
        <span className="text-[9px] font-mono text-gray-500">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-surface-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const iconForAction = (type: string) => {
  switch (type) {
    case 'search':    return <Search className="w-3.5 h-3.5" />;
    case 'tool_call': return <Wrench className="w-3.5 h-3.5" />;
    case 'select':    return <Package className="w-3.5 h-3.5" />;
    case 'propose':   return <Send className="w-3.5 h-3.5" />;
    default:          return <Bot className="w-3.5 h-3.5" />;
  }
};

export function ChatPanel({ phase, userMessage, agentState, intentContract, sessionId, isLoading, onSubmit }: ChatPanelProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSubmit(input.trim());
    setInput('');
  };

  return (
    <div className="glass-panel flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-white">Agent Console</span>
          </div>
          {sessionId && (
            <span className="text-[10px] font-mono text-gray-600">{sessionId.slice(0, 14)}…</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Empty state */}
        {!userMessage && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40 space-y-2">
            <Bot className="w-8 h-8 text-brand-400" />
            <p className="text-xs text-gray-500">Run a scenario or type a purchase request</p>
          </div>
        )}

        {/* User message */}
        {userMessage && (
          <div className="animate-fade-in">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-brand-400" />
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-1">USER REQUEST</p>
                <p className="text-sm text-gray-200 leading-relaxed">{userMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Intent Contract */}
        {intentContract && phase !== 'idle' && (
          <div className="animate-slide-up">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-allow-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldIcon className="w-3.5 h-3.5 text-allow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-[10px] font-medium text-gray-500">INTENT CONTRACT</p>
                  <BudgetTypeBadge budgetType={intentContract.budgetType} />
                </div>
                <div className="glass-panel-sm p-3 space-y-2">
                  {/* Core fields */}
                  <div className="space-y-1.5 text-xs font-mono">
                    {intentContract.maxAmount && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Max Amount</span>
                        <span className="text-allow-400 font-semibold">₹{intentContract.maxAmount?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Quantity</span>
                      <span className="text-gray-300">{intentContract.quantityMax || 1}</span>
                    </div>
                    {intentContract.productConstraints?.category && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Category</span>
                        <span className="text-gray-300 capitalize">{intentContract.productConstraints.category}</span>
                      </div>
                    )}
                    {intentContract.productConstraints?.attributes?.color && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Color</span>
                        <span className="text-gray-300 capitalize">{intentContract.productConstraints.attributes.color}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Scope</span>
                      <span className="text-gray-400 text-[10px]">{intentContract.authorizationScope?.replace('_', ' ')}</span>
                    </div>
                  </div>

                  {/* Confidence meters */}
                  {(intentContract.budgetConfidence !== undefined || intentContract.quantityConfidence !== undefined) && (
                    <div className="pt-2 border-t border-white/[0.05] space-y-1.5">
                      {intentContract.budgetConfidence !== undefined && (
                        <ConfidenceBar value={intentContract.budgetConfidence} label="Budget Confidence" />
                      )}
                      {intentContract.quantityConfidence !== undefined && (
                        <ConfidenceBar value={intentContract.quantityConfidence} label="Qty Confidence" />
                      )}
                    </div>
                  )}

                  {/* Authorization certainty */}
                  {intentContract.authorizationCertainty && (
                    <div className="pt-1.5 border-t border-white/[0.05] flex justify-between items-center">
                      <span className="text-[9px] text-gray-600 uppercase">Auth Certainty</span>
                      <CertaintyBadge certainty={intentContract.authorizationCertainty} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agent Actions */}
        {agentState?.actions?.map((action: any, i: number) => (
          <div key={i} className="animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-surface-700/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-brand-400">{iconForAction(action.type)}</span>
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500 mb-0.5 uppercase tracking-wider">{action.type.replace('_', ' ')}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{action.description}</p>
              </div>
            </div>
          </div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-2 text-brand-400 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">
              {phase === 'loading' && 'Initializing...'}
              {phase === 'intent_compiled' && 'Compiling intent...'}
              {phase === 'searching' && 'Agent searching catalog...'}
              {phase === 'firewall' && 'Running context firewall...'}
              {phase === 'evaluating' && 'Evaluating transaction...'}
              {!['loading','intent_compiled','searching','firewall','evaluating'].includes(phase) && 'Processing...'}
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buy blue running shoes under ₹3,000..."
            disabled={isLoading}
            className="flex-1 bg-surface-800/80 border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-primary flex items-center gap-1.5 px-3"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function ShieldIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  );
}
