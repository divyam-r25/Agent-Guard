import { AlertTriangle, Check, X, ShieldAlert, TrendingUp, Banknote } from 'lucide-react';

interface StepUpModalProps {
  isOpen: boolean;
  decision: any;
  intentContract: any;
  transaction: any;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
}

export function StepUpModal({ isOpen, decision, intentContract, transaction, onApprove, onReject, isLoading }: StepUpModalProps) {
  if (!isOpen || !decision || !intentContract || !transaction) return null;

  const overage = transaction.amount - (intentContract.maxAmount || 0);
  const overagePct = intentContract.maxAmount
    ? ((overage / intentContract.maxAmount) * 100).toFixed(1)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onReject} />

      {/* Modal */}
      <div className="relative glass-panel decision-stepup p-6 max-w-lg w-full animate-scale-in shadow-2xl shadow-stepup-500/10">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-stepup-500/15 flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-7 h-7 text-stepup-400" />
          </div>
          <h3 className="text-2xl font-black text-stepup-400">STEP-UP Required</h3>
          <p className="text-sm text-gray-400 mt-1">This transaction needs your explicit approval to proceed</p>
        </div>

        {/* What's being asked */}
        <div className="glass-panel-sm p-4 mb-5 space-y-3">
          {/* Product info */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-stepup-500/15 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-4 h-4 text-stepup-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {transaction.productNames?.[0] || 'Unknown Product'}
              </p>
              <p className="text-xs text-gray-500">{transaction.merchantName}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-white">₹{transaction.amount?.toLocaleString('en-IN')}</p>
              {transaction.quantity > 1 && (
                <p className="text-xs text-gray-500">Qty: {transaction.quantity}</p>
              )}
            </div>
          </div>

          <div className="border-t border-white/[0.06]" />

          {/* Amount comparison */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Your authorized limit</span>
              <span className="text-sm font-mono text-gray-300">
                ₹{intentContract.maxAmount?.toLocaleString('en-IN') || '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Transaction amount</span>
              <span className="text-sm font-mono font-bold text-white">
                ₹{transaction.amount?.toLocaleString('en-IN')}
              </span>
            </div>
            {overage > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-stepup-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Amount over limit
                </span>
                <span className="text-sm font-bold text-stepup-400">
                  +₹{overage.toLocaleString('en-IN')}
                  {overagePct && <span className="text-[10px] ml-1 opacity-70">({overagePct}%)</span>}
                </span>
              </div>
            )}
          </div>

          {/* Risk score */}
          <div className="border-t border-white/[0.06] pt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Risk Score</span>
              <span className="badge-stepup">{decision.riskScore}/100</span>
            </div>
          </div>
        </div>

        {/* Violation Reasons */}
        {decision.reasons?.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-bold text-gray-500 mb-2 uppercase tracking-wider">
              Why approval is required ({decision.reasons.length} {decision.reasons.length === 1 ? 'flag' : 'flags'})
            </p>
            <div className="space-y-1.5">
              {decision.reasons.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-stepup-500/5 border border-stepup-500/15">
                  <AlertTriangle className="w-3.5 h-3.5 text-stepup-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-300 capitalize">{r.field.replace(/_/g, ' ')}</p>
                    <p className="text-[10px] text-gray-500 font-mono">
                      Expected: <span className="text-gray-400">{r.expected}</span> → Got: <span className="text-stepup-400">{r.actual}</span>
                    </p>
                  </div>
                  <span className="text-[9px] uppercase font-bold text-stepup-500 flex-shrink-0">{r.severity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security disclaimer */}
        <p className="text-[10px] text-gray-600 text-center mb-4 leading-relaxed">
          By approving, you authorize this exact transaction. AgentGuard will create a Razorpay order for ₹{transaction.amount?.toLocaleString('en-IN')}.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onReject}
            disabled={isLoading}
            className="flex-1 btn-danger flex items-center justify-center gap-2 py-3 text-sm font-semibold"
          >
            <X className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex-1 btn-success flex items-center justify-center gap-2 py-3 text-sm font-semibold"
          >
            <Check className="w-4 h-4" />
            {isLoading ? 'Approving…' : 'Approve Purchase'}
          </button>
        </div>
      </div>
    </div>
  );
}
