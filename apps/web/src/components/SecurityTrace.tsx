import { useState } from 'react';
import { Shield, Search, Scan, AlertTriangle, ArrowRightLeft, CreditCard, CheckCircle2, XCircle, FileWarning, Brain, ListFilter, Clock } from 'lucide-react';

interface SecurityTraceProps {
  events: any[];
  phase: string;
  firewallResults: any[];
  decision: any | null;
}

const TRACE_STEPS = [
  { key: 'intent',    label: 'Intent Captured',       icon: Shield },
  { key: 'search',    label: 'Catalog Requested',     icon: Search },
  { key: 'firewall',  label: 'Content Scanned',       icon: Scan },
  { key: 'injection', label: 'Injection Check',       icon: FileWarning },
  { key: 'propose',   label: 'Transaction Proposed',  icon: ArrowRightLeft },
  { key: 'compare',   label: 'Intent Compared',       icon: AlertTriangle },
  { key: 'decision',  label: 'Payment Decision',      icon: CheckCircle2 },
  { key: 'payment',   label: 'Razorpay API',          icon: CreditCard },
];

type TabKey = 'trace' | 'events';

// Firewall outcome badge
function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  const configs: Record<string, string> = {
    PASS:       'bg-allow-500/15 text-allow-400 border-allow-500/20',
    SANITIZE:   'bg-stepup-500/15 text-stepup-400 border-stepup-500/20',
    QUARANTINE: 'bg-block-500/15 text-block-400 border-block-500/20',
    BLOCK:      'bg-block-500/20 text-block-300 border-block-400/30',
  };
  const cls = configs[outcome] || configs.PASS;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {outcome}
    </span>
  );
}

function LLMModeBadge({ mode }: { mode?: string }) {
  if (!mode) return null;
  const isLive = mode === 'LIVE';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
      isLive ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'bg-surface-700/50 text-gray-500 border border-surface-600/30'
    }`}>
      <Brain className="w-2 h-2" />
      {mode}
    </span>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    info:     'bg-brand-500',
    low:      'bg-allow-500',
    medium:   'bg-stepup-400',
    high:     'bg-block-400',
    critical: 'bg-block-500 shadow-sm shadow-block-500/60',
  };
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[severity] || 'bg-gray-600'}`} />;
}

export function SecurityTrace({ events, phase, firewallResults, decision }: SecurityTraceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('trace');

  const getStepStatus = (key: string) => {
    if (phase === 'idle') return 'idle';
    const phaseOrder = ['loading', 'intent_compiled', 'searching', 'firewall', 'evaluating', 'decided', 'step_up', 'approved'];
    const currentIdx = phaseOrder.indexOf(phase);
    const stepPhaseMap: Record<string, number> = {
      intent: 1, search: 2, firewall: 3, injection: 3,
      propose: 4, compare: 4, decision: 5, payment: 5,
    };
    const stepIdx = stepPhaseMap[key] || 0;
    if (currentIdx >= stepIdx) return 'complete';
    if (currentIdx === stepIdx - 1) return 'active';
    return 'idle';
  };

  const getStepDetail = (key: string): string => {
    const fw = firewallResults[0];
    switch (key) {
      case 'intent':
        return events.find(e => e.type === 'intent_compiled')?.message?.slice(0, 60) || 'Waiting...';
      case 'search':
        return events.find(e => e.type === 'catalog_search')?.message || 'Catalog search';
      case 'firewall':
        if (!fw) return 'Scanning...';
        return fw.outcome ? `Outcome: ${fw.outcome}` : (fw.passed ? 'Content passed' : 'Threat detected');
      case 'injection': {
        const hasInjection = firewallResults.some(r => r.injectionDetected);
        if (hasInjection) {
          const types = firewallResults.flatMap((r: any) => r.attackTypes || []);
          return `⚠ ${types.join(', ')} detected`;
        }
        return firewallResults.length > 0 ? '✓ No injection found' : 'Checking...';
      }
      case 'propose':
        return decision
          ? `${decision.reasons?.length || 0} violations found`
          : 'Proposing...';
      case 'compare':
        return decision ? `Risk score: ${decision.riskScore}/100` : 'Comparing...';
      case 'decision':
        return decision ? decision.decision.replace('_', '-') : 'Evaluating...';
      case 'payment':
        if (!decision) return 'Pending...';
        return decision.paymentCall === 'EXECUTED'
          ? `Order: ${decision.razorpayOrderId || 'created'}`
          : decision.paymentCall === 'NOT_EXECUTED'
          ? 'NOT EXECUTED'
          : 'Awaiting approval';
      default:
        return '';
    }
  };

  const getDotClass = (key: string) => {
    const status = getStepStatus(key);
    if (status === 'idle') return 'timeline-dot-idle';
    if (status === 'active') return 'timeline-dot-active';
    if (key === 'injection' && firewallResults.some(r => r.injectionDetected)) return 'timeline-dot-danger';
    if (key === 'decision') {
      if (decision?.decision === 'BLOCK') return 'timeline-dot-danger';
      if (decision?.decision === 'STEP_UP') return 'timeline-dot-warning';
      return 'timeline-dot-complete';
    }
    if (key === 'payment') {
      if (decision?.paymentCall === 'NOT_EXECUTED') return 'timeline-dot-danger';
      if (decision?.paymentCall === 'EXECUTED') return 'timeline-dot-complete';
      return 'timeline-dot-warning';
    }
    return 'timeline-dot-complete';
  };

  const hasInjection = firewallResults.some(r => r.injectionDetected);
  const fw = firewallResults[0];

  return (
    <div className="glass-panel flex flex-col h-full">
      {/* Header with tabs */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Scan className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-white">Security Trace</span>
          </div>
          {events.length > 0 && (
            <span className="text-[10px] font-mono text-gray-500">{events.length} events</span>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 bg-surface-800/60 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('trace')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'trace'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Shield className="w-3 h-3" />
            Pipeline
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'events'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <ListFilter className="w-3 h-3" />
            Audit Log
            {events.length > 0 && (
              <span className="ml-1 bg-brand-500/30 text-brand-300 px-1 rounded text-[9px]">{events.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── Pipeline Tab ── */}
        {activeTab === 'trace' && (
          <>
            <div className="space-y-0">
              {TRACE_STEPS.map((step, i) => {
                const status = getStepStatus(step.key);
                const detail = getStepDetail(step.key);
                const Icon = step.icon;
                const isLast = i === TRACE_STEPS.length - 1;

                return (
                  <div key={step.key} className={`flex gap-3 ${status !== 'idle' ? 'animate-fade-in' : 'opacity-25'}`}
                    style={{ animationDelay: `${i * 60}ms` }}>
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className={getDotClass(step.key)} />
                      {!isLast && (
                        <div className={`w-px flex-1 min-h-[24px] ${status !== 'idle' ? 'bg-surface-600' : 'bg-surface-800'}`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="pb-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${
                          status === 'idle' ? 'text-gray-600' :
                          step.key === 'injection' && hasInjection ? 'text-block-400' :
                          step.key === 'decision' && decision?.decision === 'BLOCK' ? 'text-block-400' :
                          step.key === 'decision' && decision?.decision === 'STEP_UP' ? 'text-stepup-400' :
                          'text-brand-400'
                        }`} />
                        <span className="text-xs font-semibold text-gray-300">{step.label}</span>
                        {/* Firewall outcome badge on firewall step */}
                        {step.key === 'firewall' && fw?.outcome && status === 'complete' && (
                          <OutcomeBadge outcome={fw.outcome} />
                        )}
                      </div>
                      {status !== 'idle' && (
                        <div className="space-y-0.5">
                          <p className={`text-[11px] font-mono truncate ${
                            step.key === 'injection' && hasInjection ? 'text-block-400' :
                            step.key === 'payment' && decision?.paymentCall === 'NOT_EXECUTED' ? 'text-block-400 font-bold' :
                            step.key === 'payment' && decision?.paymentCall === 'EXECUTED' ? 'text-allow-400' :
                            step.key === 'decision' && decision?.decision === 'BLOCK' ? 'text-block-400 font-bold' :
                            step.key === 'decision' && decision?.decision === 'ALLOW' ? 'text-allow-400 font-bold' :
                            'text-gray-500'
                          }`}>{detail}</p>
                          {/* LLM mode badge on firewall step */}
                          {step.key === 'firewall' && fw?.llmMeta && (
                            <LLMModeBadge mode={fw.llmMeta.mode} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* LLM Analysis Section */}
            {fw?.llmAnalysis && (
              <div className="mt-2 p-3 rounded-xl bg-brand-500/5 border border-brand-500/15 animate-fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-3.5 h-3.5 text-brand-400" />
                  <p className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">LLM Classifier Analysis</p>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">{fw.llmAnalysis.reason}</p>
                {fw.llmAnalysis.attackType && fw.llmAnalysis.attackType !== 'none' && (
                  <p className="mt-1 text-[10px] font-mono text-block-400">Attack type: {fw.llmAnalysis.attackType}</p>
                )}
              </div>
            )}

            {/* Quarantined Content */}
            {hasInjection && (
              <div className="mt-3 p-3 rounded-xl bg-block-500/5 border border-block-500/20 animate-slide-up">
                <p className="text-[10px] font-bold text-block-400 mb-2 uppercase tracking-wider">🔴 Quarantined Content</p>
                {firewallResults.filter(r => r.injectionDetected).map((r: any, i: number) => (
                  <div key={i} className="text-[11px] font-mono text-block-300/70 bg-surface-900/50 p-2 rounded-lg break-all">
                    {r.quarantinedContent?.map((c: string, j: number) => (
                      <p key={j} className="mb-1 last:mb-0">{c.length > 200 ? c.slice(0, 200) + '…' : c}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Razorpay Order ID callout */}
            {decision?.paymentCall === 'EXECUTED' && decision?.razorpayOrderId && (
              <div className="mt-3 p-3 rounded-xl bg-allow-500/8 border border-allow-500/25 animate-slide-up">
                <p className="text-[10px] font-bold text-allow-400 mb-1 uppercase tracking-wider">✅ Razorpay Order Created</p>
                <p className="text-xs font-mono text-allow-300 break-all">{decision.razorpayOrderId}</p>
              </div>
            )}
          </>
        )}

        {/* ── Audit Log Tab ── */}
        {activeTab === 'events' && (
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center opacity-40 space-y-2">
                <ListFilter className="w-6 h-6 text-gray-600" />
                <p className="text-xs text-gray-500">No events yet</p>
              </div>
            ) : (
              [...events].reverse().map((event: any, i: number) => (
                <div key={event.id || i} className="flex gap-2.5 p-2.5 bg-surface-800/40 border border-white/[0.04] rounded-xl animate-fade-in">
                  <div className="flex flex-col items-center pt-1">
                    <SeverityDot severity={event.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{event.type?.replace(/_/g, ' ')}</span>
                      <div className="flex items-center gap-1 text-gray-600 flex-shrink-0">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="text-[9px] font-mono">
                          {new Date(event.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed break-words">{event.message}</p>
                    {event.latencyMs && (
                      <span className="text-[9px] text-gray-600 font-mono">{event.latencyMs}ms</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
