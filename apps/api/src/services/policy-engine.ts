// ─── Policy Engine ───
// Makes the final ALLOW / STEP-UP / BLOCK decision.
// Critical: LLM cannot authorize payment. LLM cannot override BLOCK.
// Pre-checks run BEFORE score-based evaluation.

import { v4 as uuidv4 } from 'uuid';
import {
  IntentContract,
  ProposedTransaction,
  TransactionDecision,
  Decision,
  PaymentCallState,
  SourceOfTruthResult,
} from '../types';
import { DECISION_THRESHOLDS } from '../config/policy';
import { compareTransactionToIntent } from './intent-firewall';
import { eventLogger } from './event-logger';

interface PolicyContext {
  sessionId: string;
  injectionDetectedInSession: boolean;
  sourceOfTruthResult?: SourceOfTruthResult;
}

export function evaluateTransaction(
  transaction: ProposedTransaction,
  intent: IntentContract,
  context: PolicyContext
): TransactionDecision {
  const startTime = Date.now();
  const preCheckReasons: Array<{ field: string; expected: string; actual: string; severity: 'low' | 'medium' | 'high' | 'critical'; weight: number }> = [];
  // Use string type to avoid TS narrowing overlap errors on union comparisons
  let forceDecision: string | null = null;

  // ─── PRE-CHECK 1: Authorization Certainty ───
  // If authorization certainty is 'none', we must not make autonomous payment
  if (intent.authorizationCertainty === 'none') {
    preCheckReasons.push({
      field: 'authorization_certainty',
      expected: 'Budget or spending limit established',
      actual: `No financial authorization given (budget type: ${intent.budgetType})`,
      severity: 'high',
      weight: 35,
    });
    // Force STEP-UP — do NOT block, user may still want to approve
    if (forceDecision !== 'BLOCK') forceDecision = 'STEP_UP';
  }

  // ─── PRE-CHECK 2: Approximate Budget Exceeded ───
  // If budget is approximate and transaction exceeds the estimate, STEP-UP
  if (
    intent.budgetType === 'approximate' &&
    intent.maxAmount &&
    transaction.amount > intent.maxAmount
  ) {
    preCheckReasons.push({
      field: 'approximate_budget_exceeded',
      expected: `Approximately ₹${intent.maxAmount.toLocaleString('en-IN')} (soft ceiling)`,
      actual: `₹${transaction.amount.toLocaleString('en-IN')} (${((transaction.amount - intent.maxAmount) / intent.maxAmount * 100).toFixed(1)}% over estimate)`,
      severity: 'medium',
      weight: 25,
    });
    if (forceDecision !== 'BLOCK') forceDecision = 'STEP_UP';
  }

  // ─── PRE-CHECK 3: Source-of-Truth Critical Mismatch ───
  if (context.sourceOfTruthResult && !context.sourceOfTruthResult.verified) {
    const criticalDiscs = context.sourceOfTruthResult.discrepancies.filter(
      d => d.severity === 'critical' || d.severity === 'high'
    );
    if (criticalDiscs.length > 0) {
      for (const disc of criticalDiscs) {
        preCheckReasons.push({
          field: `source_of_truth.${disc.field}`,
          expected: `Verified: ${disc.verified}`,
          actual: `Agent claimed: ${disc.agentClaimed}`,
          severity: disc.severity,
          weight: disc.severity === 'critical' ? 60 : 40,
        });
      }
      forceDecision = 'BLOCK'; // Source-of-truth mismatch is always BLOCK
    }
  }

  // ─── Intent Comparison ───
  const comparison = compareTransactionToIntent(transaction, intent);

  // ─── Injection bonus ───
  let adjustedScore = comparison.totalRiskScore;
  if (context.injectionDetectedInSession && comparison.totalRiskScore > 0) {
    adjustedScore = Math.min(adjustedScore + 30, 100);
    comparison.reasons.push({
      field: 'session_context',
      expected: 'No injection detected',
      actual: 'Injection was detected in this session alongside intent mismatch',
      severity: 'high',
      weight: 30,
    });
  }

  // Combine pre-check reasons with intent comparison reasons
  const allReasons = [...preCheckReasons, ...comparison.reasons];

  // ─── Apply pre-check force decisions ───
  let decision: Decision;
  let paymentCall: PaymentCallState;

  if (forceDecision === 'BLOCK') {
    decision = 'BLOCK';
    paymentCall = 'NOT_EXECUTED';
    adjustedScore = Math.max(adjustedScore, 70);
  } else if (forceDecision === 'STEP_UP') {
    // Can still be overridden to BLOCK by score
    if (adjustedScore > DECISION_THRESHOLDS.STEP_UP_MAX) {
      decision = 'BLOCK';
      paymentCall = 'NOT_EXECUTED';
    } else {
      decision = 'STEP_UP';
      paymentCall = 'WAITING_FOR_APPROVAL';
    }
  } else {
    // Normal score-based decision
    if (adjustedScore <= DECISION_THRESHOLDS.ALLOW_MAX) {
      decision = 'ALLOW';
      paymentCall = 'EXECUTED';
    } else if (adjustedScore <= DECISION_THRESHOLDS.STEP_UP_MAX) {
      decision = 'STEP_UP';
      paymentCall = 'WAITING_FOR_APPROVAL';
    } else {
      decision = 'BLOCK';
      paymentCall = 'NOT_EXECUTED';
    }
  }

  // Critical severity always forces BLOCK
  const hasCritical = allReasons.some(r => r.severity === 'critical');
  if (hasCritical && decision !== 'BLOCK') {
    decision = 'BLOCK';
    paymentCall = 'NOT_EXECUTED';
    adjustedScore = Math.max(adjustedScore, 65);
  }

  const transactionDecision: TransactionDecision = {
    transactionId: transaction.id,
    intentId: intent.id,
    decision,
    riskScore: adjustedScore,
    reasons: allReasons,
    paymentCall,
    sourceOfTruthResult: context.sourceOfTruthResult,
    timestamp: new Date().toISOString(),
  };

  eventLogger.log({
    sessionId: context.sessionId,
    intentId: intent.id,
    transactionId: transaction.id,
    merchantId: transaction.merchantId,
    type: 'decision',
    severity: decision === 'BLOCK' ? 'critical' : decision === 'STEP_UP' ? 'high' : 'info',
    message: `Policy decision: ${decision} (risk score: ${adjustedScore}/100, reasons: ${allReasons.length})`,
    metadata: {
      decision,
      riskScore: adjustedScore,
      reasons: allReasons,
      violationCount: allReasons.length,
      paymentCall,
      preCheckForced: forceDecision,
      authorizationCertainty: intent.authorizationCertainty,
      budgetType: intent.budgetType,
      sourceOfTruthVerified: context.sourceOfTruthResult?.verified,
    },
    latencyMs: Date.now() - startTime,
  });

  return transactionDecision;
}

/**
 * Re-evaluate after STEP-UP approval.
 * The user has explicitly approved the EXACT transaction shown to them.
 * Returns updated decision — authorization token is issued in scenario-runner.
 */
export function approveStepUp(
  originalDecision: TransactionDecision,
  sessionId: string
): TransactionDecision {
  const approved: TransactionDecision = {
    ...originalDecision,
    decision: 'ALLOW',
    paymentCall: 'EXECUTED',
    timestamp: new Date().toISOString(),
  };

  eventLogger.log({
    sessionId,
    intentId: originalDecision.intentId,
    transactionId: originalDecision.transactionId,
    type: 'step_up_approval',
    severity: 'info',
    message: `STEP-UP approved by user. Decision changed to ALLOW. Auth token will be issued.`,
    metadata: {
      originalRiskScore: originalDecision.riskScore,
      originalReasons: originalDecision.reasons,
    },
  });

  return approved;
}
