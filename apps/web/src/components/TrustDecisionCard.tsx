import { ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, CheckCircle2, XCircle, Banknote, Clock } from 'lucide-react';

interface TrustDecisionCardProps {
  decision: any | null;
  intentContract: any | null;
  transaction: any | null;
  phase: string;
}

const LOADING_MESSAGES: Record<string, string> = {
  intent_compiled: 'Compiling intent contract…',
  searching:       'Agent searching catalog…',
  firewall:        'Running context firewall…',
  evaluating:      'Evaluating transaction intent…',
  loading:         'Initializing pipeline…',
};

export function TrustDecisionCard({ decision, intentContract, transaction, phase }: TrustDecisionCardProps) {
  // Idle state
  if (!decision && phase === 'idle') {
    return (
      <div className="glass-panel p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="w-20 h-20 rounded-2xl bg-surface-800/80 flex items-center justify-center mb-5 animate-float">
          <ShieldCheck className="w-10 h-10 text-brand-400/40" />
        </div>
        <h2 className="text-lg font-bold text-gray-300 mb-2">Trust Decision Engine</h2>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
          Select a demo scenario or enter a purchase request to see AgentGuard evaluate the transaction in real time.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2 w-full max-w-xs">
          {[
            { label: 'ALLOW', color: 'text-allow-400 bg-allow-500/10 border-allow-500/20' },
            { label: 'STEP-UP', color: 'text-stepup-400 bg-stepup-500/10 border-stepup-500/20' },
            { label: 'BLOCK', color: 'text-block-400 bg-block-500/10 border-block-500/20' },
          ].map(d => (
            <div key={d.label} className={`border rounded-xl py-2 text-center text-xs font-bold ${d.color}`}>
              {d.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Loading state
  if (!decision && phase !== 'idle') {
    return (
      <div className="glass-panel p-8 flex flex-col items-center justify-center h-full">
        <div className="relative w-16 h-16 rounded-2xl bg-brand-600/10 flex items-center justify-center mb-4">
          <div className="w-8 h-8 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-sm text-gray-400 animate-pulse">
          {LOADING_MESSAGES[phase] || 'Processing…'}
        </p>
        <div className="mt-4 flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400/50 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!decision) return null;

  const isAllow  = decision.decision === 'ALLOW';
  const isStepUp = decision.decision === 'STEP_UP';
  const isBlock  = decision.decision === 'BLOCK';

  const decisionClass = isAllow ? 'decision-allow' : isStepUp ? 'decision-stepup' : 'decision-block';
  const glowClass     = isAllow ? 'animate-glow-allow' : isStepUp ? 'animate-glow-stepup' : 'animate-glow-block';
  const DecisionIcon  = isAllow ? ShieldCheck : isStepUp ? ShieldAlert : ShieldX;
  const iconColor     = isAllow ? 'text-allow-400' : isStepUp ? 'text-stepup-400' : 'text-block-400';
  const iconBg        = isAllow ? 'bg-allow-500/15' : isStepUp ? 'bg-stepup-500/15' : 'bg-block-500/15';
  const badgeClass    = isAllow ? 'badge-allow' : isStepUp ? 'badge-stepup' : 'badge-block';
  const accentColor   = isAllow ? 'text-allow-400' : isStepUp ? 'text-stepup-400' : 'text-block-400';

  return (
    <div className={`glass-panel p-5 flex flex-col h-full ${decisionClass} ${glowClass} animate-scale-in`}>
      {/* Decision header */}
      <div className="text-center mb-5">
        <div className={`w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center ${iconBg}`}>
          <DecisionIcon className={`w-8 h-8 ${iconColor}`} />
        </div>
        <h2 className={`text-3xl font-black tracking-tight ${iconColor}`}>
          {decision.decision.replace('_', '-')}
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className={badgeClass}>Risk Score: {decision.riskScore}/100</span>
          <span className="text-[10px] font-mono text-gray-600">
            {new Date(decision.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Risk Meter with zone markers */}
      <div className="mb-5">
        <div className="risk-meter-track relative">
          {/* Zone markers */}
          <div className="absolute inset-0 flex">
            <div className="flex-[25] bg-allow-500/10 rounded-l-full" />
            <div className="flex-[35] bg-stepup-500/8" />
            <div className="flex-[40] bg-block-500/8 rounded-r-full" />
          </div>
          <div
            className={`risk-meter-fill relative z-10 ${
              isAllow  ? 'bg-gradient-to-r from-allow-600 to-allow-400' :
              isStepUp ? 'bg-gradient-to-r from-stepup-600 to-stepup-400' :
              'bg-gradient-to-r from-block-700 to-block-400'
            }`}
            style={{ width: `${decision.riskScore}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-gray-600 font-mono">
          <span className="text-allow-600">0 — ALLOW</span>
          <span className="text-stepup-600">25 — STEP-UP</span>
          <span className="text-block-600">60 — BLOCK</span>
        </div>
      </div>

      {/* Intent vs Transaction diff */}
      {intentContract && transaction && (
        <div className="mb-4">
          <h3 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">Intent vs Transaction</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="glass-panel-sm p-3">
              <p className="text-[9px] font-bold text-brand-400 mb-2 uppercase tracking-wider">User Intent</p>
              <div className="space-y-1.5 text-xs font-mono">
                <div><span className="text-gray-500">Max: </span><span className="text-white">₹{intentContract.maxAmount?.toLocaleString('en-IN') || '—'}</span></div>
                <div><span className="text-gray-500">Qty: </span><span className="text-white">{intentContract.quantityMax || '—'}</span></div>
                <div><span className="text-gray-500">Cat: </span><span className="text-white capitalize">{intentContract.productConstraints?.category || 'any'}</span></div>
              </div>
            </div>
            <div className="glass-panel-sm p-3">
              <p className="text-[9px] font-bold text-gray-400 mb-2 uppercase tracking-wider">Actual Transaction</p>
              <div className="space-y-1.5 text-xs font-mono">
                <DiffValue label="Amt" expected={intentContract.maxAmount} actual={transaction.amount} format="currency" />
                <DiffValue label="Qty" expected={intentContract.quantityMax} actual={transaction.quantity} />
                <div><span className="text-gray-500">Mer: </span><span className="text-white truncate text-[10px]">{transaction.merchantName}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Violation Reasons */}
      {decision.reasons?.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto mb-4">
          <h3 className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">
            Violation Details ({decision.reasons.length})
          </h3>
          <div className="space-y-1.5">
            {decision.reasons.map((r: any, i: number) => (
              <div key={i} className="glass-panel-sm p-2.5 flex items-start gap-2 animate-slide-up" style={{ animationDelay: `${i * 80}ms` }}>
                {r.severity === 'critical' || r.severity === 'high' ? (
                  <XCircle className="w-3.5 h-3.5 text-block-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-stepup-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-300 capitalize">{r.field.replace(/_/g, ' ')}</p>
                  <p className="text-[10px] text-gray-500 font-mono">
                    Expected: <span className="text-gray-400">{r.expected}</span> → Got: <span className={r.severity === 'high' || r.severity === 'critical' ? 'text-block-400 font-bold' : 'text-stepup-400'}>{r.actual}</span>
                  </p>
                </div>
                <span className={`text-[9px] font-bold uppercase flex-shrink-0 ${
                  r.severity === 'critical' ? 'text-block-300' :
                  r.severity === 'high' ? 'text-block-400' :
                  r.severity === 'medium' ? 'text-stepup-400' :
                  'text-gray-500'
                }`}>{r.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Status */}
      <div className={`p-3 rounded-xl border text-center ${
        decision.paymentCall === 'EXECUTED'
          ? 'border-allow-500/25 bg-allow-500/8'
          : decision.paymentCall === 'NOT_EXECUTED'
          ? 'border-block-500/25 bg-block-500/8'
          : 'border-stepup-500/25 bg-stepup-500/8'
      }`}>
        {decision.paymentCall === 'EXECUTED' ? (
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-allow-400" />
              <span className="text-xs font-bold text-allow-400">Payment Authorized</span>
            </div>
            {decision.razorpayOrderId && (
              <div className="flex items-center justify-center gap-1.5">
                <Banknote className="w-3 h-3 text-allow-500" />
                <span className="text-[10px] font-mono text-allow-500/80">{decision.razorpayOrderId}</span>
              </div>
            )}
          </div>
        ) : decision.paymentCall === 'NOT_EXECUTED' ? (
          <div className="flex items-center justify-center gap-2">
            <XCircle className="w-4 h-4 text-block-400" />
            <span className="text-xs font-bold text-block-400">Payment Blocked — NOT EXECUTED</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-stepup-400" />
            <span className="text-xs font-bold text-stepup-400">Awaiting User Approval</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffValue({ label, expected, actual, format }: { label: string; expected: any; actual: any; format?: string }) {
  const isMatch = expected === undefined || expected === null || actual <= expected;
  const formatVal = (v: any) => format === 'currency' ? `₹${Number(v)?.toLocaleString('en-IN')}` : String(v ?? '—');

  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className={isMatch ? 'text-white' : 'text-block-400 font-bold'}>
        {formatVal(actual)}
        {!isMatch && <span className="text-block-500 text-[10px] ml-1">↑</span>}
      </span>
    </div>
  );
}
