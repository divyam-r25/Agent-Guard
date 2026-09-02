import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { ChatPanel } from './components/ChatPanel';
import { TrustDecisionCard } from './components/TrustDecisionCard';
import { SecurityTrace } from './components/SecurityTrace';
import { AttackLab } from './components/AttackLab';
import { StepUpModal } from './components/StepUpModal';
import { useAgentGuard } from './hooks/useAgentGuard';
import { api } from './lib/api';

export default function App() {
  const {
    phase,
    pipeline,
    isLoading,
    userMessage,
    activeScenario,
    runScenario,
    runFreeform,
    approveStepUp,
    resetDemo,
  } = useAgentGuard();

  const [health, setHealth] = useState<any>(null);
  const [showStepUp, setShowStepUp] = useState(false);

  // Check API health on mount
  useEffect(() => {
    const checkHealth = () => {
      api.health()
        .then(setHealth)
        .catch(() => setHealth(null));
    };
    checkHealth();
    // Poll health every 30s
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show STEP-UP modal when needed
  useEffect(() => {
    if (phase === 'step_up') {
      setShowStepUp(true);
    }
  }, [phase]);

  const handleApprove = async () => {
    await approveStepUp();
    setShowStepUp(false);
  };

  const handleReject = () => {
    setShowStepUp(false);
  };

  // Compute live stats from pipeline events
  const stats = pipeline.events.length > 0 ? {
    decisions: pipeline.events.filter(e => e.type === 'decision').length,
    blocked: pipeline.events.filter(e => e.type === 'decision' && e.metadata?.decision === 'BLOCK').length,
    injections: pipeline.events.filter(e => e.type === 'injection').length,
  } : undefined;

  return (
    <div className="min-h-screen flex flex-col p-3 gap-3 max-w-[1700px] mx-auto">
      {/* Header */}
      <Header
        paymentProvider={health?.payment?.provider}
        isConnected={!!health}
        stats={stats}
      />

      {/* Main 3-panel layout */}
      <div
        className="flex-1 grid grid-cols-12 gap-3 min-h-0"
        style={{ height: 'calc(100vh - 186px)' }}
      >
        {/* Left — Chat / Agent Console */}
        <div className="col-span-3 min-h-0">
          <ChatPanel
            phase={phase}
            userMessage={userMessage}
            agentState={pipeline.agentState}
            intentContract={pipeline.intentContract}
            sessionId={pipeline.session?.id || null}
            isLoading={isLoading}
            onSubmit={runFreeform}
          />
        </div>

        {/* Center — Trust Decision */}
        <div className="col-span-5 min-h-0">
          <TrustDecisionCard
            decision={pipeline.decision}
            intentContract={pipeline.intentContract}
            transaction={pipeline.agentState?.proposedTransaction || null}
            phase={phase}
          />
        </div>

        {/* Right — Security Trace */}
        <div className="col-span-4 min-h-0">
          <SecurityTrace
            events={pipeline.events}
            phase={phase}
            firewallResults={pipeline.firewallResults}
            decision={pipeline.decision}
          />
        </div>
      </div>

      {/* Bottom — Attack Lab */}
      <AttackLab
        onRunScenario={runScenario}
        activeScenario={activeScenario}
        isLoading={isLoading}
        onReset={resetDemo}
      />

      {/* Error toast */}
      {pipeline.error && (
        <div className="fixed bottom-6 right-6 glass-panel border-block-500/30 bg-block-500/5 p-4 max-w-sm animate-slide-up z-40 shadow-lg shadow-block-500/10">
          <p className="text-sm font-semibold text-block-400 mb-1">Error</p>
          <p className="text-xs text-gray-400">{pipeline.error}</p>
        </div>
      )}

      {/* STEP-UP Modal */}
      <StepUpModal
        isOpen={showStepUp}
        decision={pipeline.decision}
        intentContract={pipeline.intentContract}
        transaction={pipeline.agentState?.proposedTransaction}
        onApprove={handleApprove}
        onReject={handleReject}
        isLoading={isLoading}
      />

      {/* Backend disconnected warning */}
      {!health && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 glass-panel border-stepup-500/30 bg-stepup-500/5 px-5 py-3 z-50 animate-slide-up">
          <p className="text-xs text-stepup-400 font-medium">
            ⚠ Backend not connected — start the API:{' '}
            <code className="font-mono bg-surface-800 px-1.5 py-0.5 rounded text-[11px]">npm run dev:api</code>
          </p>
        </div>
      )}
    </div>
  );
}
