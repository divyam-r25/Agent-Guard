// ─── useAgentGuard Hook ───
// Central state management for the AgentGuard console

import { useState, useCallback } from 'react';
import { api } from '../lib/api';

export type AppPhase = 'idle' | 'loading' | 'intent_compiled' | 'searching' | 'firewall' | 'evaluating' | 'decided' | 'step_up' | 'approved' | 'error';

export interface PipelineState {
  session: any | null;
  intentContract: any | null;
  firewallResults: any[];
  agentState: any | null;
  decision: any | null;
  events: any[];
  error: string | null;
}

export function useAgentGuard() {
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [pipeline, setPipeline] = useState<PipelineState>({
    session: null,
    intentContract: null,
    firewallResults: [],
    agentState: null,
    decision: null,
    events: [],
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setPipeline({
      session: null,
      intentContract: null,
      firewallResults: [],
      agentState: null,
      decision: null,
      events: [],
      error: null,
    });
    setPhase('idle');
    setIsLoading(false);
    setUserMessage('');
    setActiveScenario(null);
  }, []);

  const runScenario = useCallback(async (scenarioId: string) => {
    setIsLoading(true);
    setActiveScenario(scenarioId);
    setPhase('loading');
    setPipeline(prev => ({ ...prev, error: null }));

    try {
      // Simulate phases for visual effect
      setPhase('intent_compiled');
      await new Promise(r => setTimeout(r, 400));
      setPhase('searching');
      await new Promise(r => setTimeout(r, 400));
      setPhase('firewall');
      await new Promise(r => setTimeout(r, 400));
      setPhase('evaluating');

      const result = await api.runScenario(scenarioId);

      setPipeline({
        session: result.session,
        intentContract: result.intentContract,
        firewallResults: result.firewallResults,
        agentState: result.agentState,
        decision: result.decision,
        events: result.events,
        error: null,
      });

      if (result.decision?.decision === 'STEP_UP') {
        setPhase('step_up');
      } else {
        setPhase('decided');
      }
      setUserMessage(result.intentContract?.originalRequest || '');
    } catch (err: any) {
      setPipeline(prev => ({ ...prev, error: err.message }));
      setPhase('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runFreeform = useCallback(async (message: string) => {
    setIsLoading(true);
    setActiveScenario(null);
    setUserMessage(message);
    setPhase('loading');
    setPipeline(prev => ({ ...prev, error: null }));

    try {
      setPhase('intent_compiled');
      await new Promise(r => setTimeout(r, 300));
      setPhase('searching');
      await new Promise(r => setTimeout(r, 300));
      setPhase('firewall');
      await new Promise(r => setTimeout(r, 300));
      setPhase('evaluating');

      const result = await api.runFreeform(message);

      setPipeline({
        session: result.session,
        intentContract: result.intentContract,
        firewallResults: result.firewallResults,
        agentState: result.agentState,
        decision: result.decision,
        events: result.events,
        error: null,
      });

      if (result.decision?.decision === 'STEP_UP') {
        setPhase('step_up');
      } else {
        setPhase('decided');
      }
    } catch (err: any) {
      setPipeline(prev => ({ ...prev, error: err.message }));
      setPhase('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const approveStepUp = useCallback(async () => {
    if (!pipeline.decision || !pipeline.session) return;
    setIsLoading(true);

    try {
      const result = await api.approveStepUp(
        pipeline.decision.transactionId,
        pipeline.session.id
      );

      setPipeline(prev => ({
        ...prev,
        decision: result,
        events: [...prev.events, {
          id: `evt_approved_${Date.now()}`,
          type: 'step_up_approval',
          severity: 'info',
          message: 'STEP-UP approved by user',
          timestamp: new Date().toISOString(),
        }],
      }));
      setPhase('approved');
    } catch (err: any) {
      setPipeline(prev => ({ ...prev, error: err.message }));
    } finally {
      setIsLoading(false);
    }
  }, [pipeline.decision, pipeline.session]);

  const resetDemo = useCallback(async () => {
    try {
      await api.resetDemo();
    } catch { /* ignore */ }
    resetState();
  }, [resetState]);

  return {
    phase,
    pipeline,
    isLoading,
    userMessage,
    activeScenario,
    runScenario,
    runFreeform,
    approveStepUp,
    resetDemo,
    setUserMessage,
  };
}
