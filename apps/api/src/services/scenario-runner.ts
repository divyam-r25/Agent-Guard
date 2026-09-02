// ─── Demo Scenario Orchestrator ───
// Runs deterministic demo scenarios from fixtures
// Per PRD Section 18

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Session,
  IntentContract,
  ProposedTransaction,
  TransactionDecision,
  SecurityEvent,
  FirewallResult,
  AgentState,
  PipelineResult,
} from '../types';
import { catalogSimulator } from './catalog-simulator';
import { runContextFirewall } from './context-firewall';
import { compileIntent } from './intent-compiler';
import { evaluateTransaction, approveStepUp } from './policy-engine';
import { paymentGateway } from './payment-provider';
import { createShoppingAgent } from './shopping-agent';
import { eventLogger } from './event-logger';

interface ScenarioFixture {
  id: string;
  name: string;
  description: string;
  userMessage: string;
  expectedDecision: string;
  attackType?: string;
  intent: any;
  selectedProduct: string;
  useMaliciousPayload?: string;
  transaction: any;
}

// In-memory state store
const sessions: Map<string, Session> = new Map();
const intents: Map<string, IntentContract> = new Map();
const decisions: Map<string, TransactionDecision> = new Map();
const pipelineResults: Map<string, PipelineResult> = new Map();

function loadScenarios(): ScenarioFixture[] {
  const filepath = path.resolve(__dirname, '../../../../fixtures/demo-scenarios.json');
  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  return data.scenarios;
}

export function createSession(): Session {
  const session: Session = {
    id: `session_${uuidv4().slice(0, 8)}`,
    userId: 'demo_user_001',
    agentId: 'demo-shopping-agent',
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  sessions.set(session.id, session);

  eventLogger.log({
    sessionId: session.id,
    type: 'session',
    severity: 'info',
    message: `Session created: ${session.id}`,
    metadata: { userId: session.userId, agentId: session.agentId },
  });

  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function getStoredIntent(intentId: string): IntentContract | undefined {
  return intents.get(intentId);
}

export function getStoredDecision(transactionId: string): TransactionDecision | undefined {
  return decisions.get(transactionId);
}

export function getPipelineResult(sessionId: string): PipelineResult | undefined {
  return pipelineResults.get(sessionId);
}

export async function runScenario(scenarioId: string): Promise<PipelineResult> {
  const scenarios = loadScenarios();
  const scenario = scenarios.find(s => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  // 1. Create session
  const session = createSession();

  // 2. Compile intent (use scenario overrides for determinism)
  const intentContract: IntentContract = {
    id: `intent_${uuidv4().slice(0, 8)}`,
    sessionId: session.id,
    originalRequest: scenario.userMessage,
    maxAmount: scenario.intent.maxAmount,
    currency: scenario.intent.currency || 'INR',
    quantityMax: scenario.intent.quantityMax,
    // V2 required fields — deterministic defaults for pre-defined scenarios
    budgetType: scenario.intent.maxAmount ? 'exact' : 'unknown',
    budgetConfidence: scenario.intent.maxAmount ? 0.95 : 0,
    quantityConfidence: scenario.intent.quantityMax ? 0.95 : 0.85,
    authorizationCertainty: (scenario.intent.maxAmount && scenario.intent.quantityMax) ? 'high' : 'medium',
    productConstraints: {
      category: scenario.intent.category,
      attributes: scenario.intent.attributes,
    },
    merchantConstraints: scenario.intent.merchantConstraints,
    addressPolicy: scenario.intent.addressPolicy || 'default_address',
    authorizationScope: scenario.intent.authorizationScope || 'single_purchase',
    userConfirmationRequiredAbove: scenario.intent.maxAmount,
    createdAt: new Date().toISOString(),
  };
  intents.set(intentContract.id, intentContract);

  eventLogger.log({
    sessionId: session.id,
    intentId: intentContract.id,
    type: 'intent_compiled',
    severity: 'info',
    message: `Intent compiled from scenario: ${scenario.name}`,
    metadata: { contract: intentContract },
  });

  // 3. Context Firewall (check for injection)
  const firewallResults: FirewallResult[] = [];
  let injectionInSession = false;

  if (scenario.useMaliciousPayload) {
    // Get the product with malicious payload injected
    const malProduct = catalogSimulator.getProductWithInjection(
      scenario.selectedProduct,
      scenario.useMaliciousPayload
    );
    if (malProduct) {
      const fwResult = await runContextFirewall(malProduct, session.id);
      firewallResults.push(fwResult);
      injectionInSession = fwResult.injectionDetected;
    }
  } else {
    // Normal product scan
    const product = catalogSimulator.getProduct(scenario.selectedProduct);
    if (product) {
      const fwResult = await runContextFirewall(product, session.id);
      firewallResults.push(fwResult);
    }
  }

  // 4. Build proposed transaction from scenario
  const transaction: ProposedTransaction = {
    id: `txn_${uuidv4().slice(0, 8)}`,
    intentId: intentContract.id,
    merchantId: scenario.transaction.merchantId,
    merchantName: scenario.transaction.merchantName,
    productIds: scenario.transaction.productIds,
    productNames: scenario.transaction.productNames,
    amount: scenario.transaction.amount,
    currency: scenario.transaction.currency || 'INR',
    quantity: scenario.transaction.quantity,
    shippingAddressId: scenario.transaction.shippingAddressId || 'addr_default',
    agentId: session.agentId,
    sessionId: session.id,
    category: scenario.transaction.category,
  };

  // 5. Agent state
  const agentState: AgentState = {
    sessionId: session.id,
    status: 'awaiting_decision',
    actions: [
      {
        type: 'search',
        description: `Searching catalog for: "${scenario.userMessage}"`,
        timestamp: new Date().toISOString(),
      },
      {
        type: 'tool_call',
        description: `Catalog search completed`,
        data: { resultCount: 1 },
        timestamp: new Date().toISOString(),
      },
      {
        type: 'select',
        description: `Selected: ${scenario.transaction.productNames[0]} (₹${scenario.transaction.amount}) from ${scenario.transaction.merchantName}`,
        data: { productId: scenario.selectedProduct },
        timestamp: new Date().toISOString(),
      },
      {
        type: 'propose',
        description: `Proposing transaction: ₹${scenario.transaction.amount} for ${scenario.transaction.quantity}x ${scenario.transaction.productNames[0]}`,
        data: { transaction },
        timestamp: new Date().toISOString(),
      },
    ],
    selectedProduct: catalogSimulator.getProduct(scenario.selectedProduct) ||
      catalogSimulator.getProduct('prod_001'),
    proposedTransaction: transaction,
  };

  // 6. Policy Engine evaluation
  const decision = evaluateTransaction(
    transaction,
    intentContract,
    { sessionId: session.id, injectionDetectedInSession: injectionInSession }
  );
  decisions.set(transaction.id, decision);

  // 7. Payment (only if ALLOW)
  if (decision.decision === 'ALLOW') {
    const orderResult = await paymentGateway.createOrder({
      amount: transaction.amount,
      currency: transaction.currency,
      receipt: `receipt_${transaction.id}`,
      notes: {
        intentId: intentContract.id,
        sessionId: session.id,
        productIds: transaction.productIds.join(','),
      },
    }, session.id);

    if (orderResult.success) {
      decision.razorpayOrderId = orderResult.orderId;
      decision.paymentCall = 'EXECUTED';
    }
  }

  // 8. Build pipeline result
  const result: PipelineResult = {
    session,
    intentContract,
    firewallResults,
    agentState,
    decision,
    events: eventLogger.getEvents(session.id),
  };

  pipelineResults.set(session.id, result);
  return result;
}

export async function runFreeformRequest(userMessage: string): Promise<PipelineResult> {
  // 1. Create session
  const session = createSession();

  // 2. Compile intent from natural language
  const intentContract = await compileIntent(userMessage, session.id);
  intents.set(intentContract.id, intentContract);

  // 3. Shopping agent searches and proposes
  const agent = createShoppingAgent();
  const { state: agentState, product } = await agent.searchAndPropose(
    userMessage,
    session.id,
    intentContract.id
  );

  if (!agentState.proposedTransaction || !product) {
    const result: PipelineResult = {
      session,
      intentContract,
      firewallResults: [],
      agentState,
      decision: {
        transactionId: 'none',
        intentId: intentContract.id,
        decision: 'BLOCK',
        riskScore: 100,
        reasons: [{ field: 'product', expected: 'Found', actual: 'Not found', severity: 'critical', weight: 100 }],
        paymentCall: 'NOT_EXECUTED',
        timestamp: new Date().toISOString(),
      },
      events: eventLogger.getEvents(session.id),
    };
    pipelineResults.set(session.id, result);
    return result;
  }

  // 4. Context Firewall
  const fwResult = await runContextFirewall(product, session.id);

  // 5. Policy Engine
  const decision = evaluateTransaction(
    agentState.proposedTransaction,
    intentContract,
    { sessionId: session.id, injectionDetectedInSession: fwResult.injectionDetected }
  );
  decisions.set(agentState.proposedTransaction.id, decision);

  // 6. Payment if ALLOW
  if (decision.decision === 'ALLOW') {
    const orderResult = await paymentGateway.createOrder({
      amount: agentState.proposedTransaction.amount,
      currency: agentState.proposedTransaction.currency,
      receipt: `receipt_${agentState.proposedTransaction.id}`,
      notes: {
        intentId: intentContract.id,
        sessionId: session.id,
      },
    }, session.id);

    if (orderResult.success) {
      decision.razorpayOrderId = orderResult.orderId;
      decision.paymentCall = 'EXECUTED';
    }
  }

  const result: PipelineResult = {
    session,
    intentContract,
    firewallResults: [fwResult],
    agentState,
    decision,
    events: eventLogger.getEvents(session.id),
  };

  pipelineResults.set(session.id, result);
  return result;
}

export async function handleStepUpApproval(transactionId: string, sessionId: string): Promise<TransactionDecision> {
  const originalDecision = decisions.get(transactionId);
  if (!originalDecision) throw new Error(`Transaction not found: ${transactionId}`);
  if (originalDecision.decision !== 'STEP_UP') throw new Error('Transaction is not in STEP_UP state');

  const approved = approveStepUp(originalDecision, sessionId);

  // Now create payment
  const pipelineResult = pipelineResults.get(sessionId);
  if (pipelineResult?.agentState.proposedTransaction) {
    const txn = pipelineResult.agentState.proposedTransaction;
    const orderResult = await paymentGateway.createOrder({
      amount: txn.amount,
      currency: txn.currency,
      receipt: `receipt_${txn.id}`,
      notes: {
        intentId: originalDecision.intentId,
        sessionId,
        stepUpApproved: 'true',
      },
    }, sessionId);

    if (orderResult.success) {
      approved.razorpayOrderId = orderResult.orderId;
      approved.paymentCall = 'EXECUTED';
    }

    // Update stored decision and pipeline result
    decisions.set(transactionId, approved);
    pipelineResult.decision = approved;
    pipelineResult.events = eventLogger.getEvents(sessionId);
  }

  return approved;
}

export function resetAll(): void {
  sessions.clear();
  intents.clear();
  decisions.clear();
  pipelineResults.clear();
  eventLogger.reset();
  catalogSimulator.reset();
}

export function getAvailableScenarios() {
  return loadScenarios().map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    expectedDecision: s.expectedDecision,
    attackType: s.attackType,
    userMessage: s.userMessage,
  }));
}
