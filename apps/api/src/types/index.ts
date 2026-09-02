// ─── AgentGuard Shared Types ───
// All TypeScript interfaces for the AgentGuard system

// ─── Session ───
export interface Session {
  id: string;
  userId: string;
  agentId: string;
  createdAt: string;
  status: 'active' | 'closed';
}

// ─── Budget Type ───
// exact: user gave a hard ceiling ("under ₹3,000")
// approximate: user gave a soft estimate ("around 5k")
// unknown: no budget information given
export type BudgetType = 'exact' | 'approximate' | 'unknown';

// ─── Authorization Certainty ───
// How confident we are that autonomous payment is authorized
export type AuthorizationCertainty = 'high' | 'medium' | 'low' | 'none';

// ─── Confidence Score for a single intent field ───
export interface FieldConfidence {
  value: string | number | null;
  confidence: number; // 0.0 – 1.0
  isHardConstraint: boolean; // true = must satisfy, false = soft preference
}

// ─── Intent Contract V2 ───
// Extended with per-field confidence, budgetType, and authorization certainty
export interface IntentContract {
  id: string;
  sessionId: string;
  originalRequest: string;

  // Budget
  maxAmount?: number;
  minAmount?: number;
  budgetType: BudgetType;
  budgetConfidence: number; // 0.0 – 1.0

  // Currency
  currency: string;

  // Quantity
  quantityMax?: number;
  quantityConfidence: number;

  // Category & attributes
  productConstraints?: {
    category?: string;
    attributes?: Record<string, string>;
    categoryConfidence?: number;
  };

  // Merchant
  merchantConstraints?: {
    allowedMerchants?: string[];
    blockedMerchants?: string[];
    merchantConfidence?: number;
  };

  // Authorization
  addressPolicy: string;
  authorizationScope: 'single_purchase' | 'recurring' | 'multi_purchase';
  authorizationCertainty: AuthorizationCertainty;

  // Legacy compat
  userConfirmationRequiredAbove?: number;
  createdAt: string;
}

// ─── Product ───
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  merchantId: string;
  merchantName: string;
  stock: number;
  category: string;
  shipping: {
    estimatedDays: number;
  };
  imageUrl?: string;
}

// ─── Malicious Payload ───
export interface MaliciousPayload {
  id: string;
  attackType: 'goal_hijack' | 'data_hiding' | 'transaction_manipulation';
  attackVariant: string;
  targetField: string;
  payload: string;
  description: string;
}

// ─── Proposed Transaction ───
export interface ProposedTransaction {
  id: string;
  intentId: string;
  merchantId: string;
  merchantName: string;
  productIds: string[];
  productNames: string[];
  amount: number;
  currency: string;
  quantity: number;
  shippingAddressId: string;
  agentId: string;
  sessionId: string;
  category?: string;
}

// ─── Decision Types ───
export type Decision = 'ALLOW' | 'STEP_UP' | 'BLOCK';
export type PaymentCallState = 'EXECUTED' | 'WAITING_FOR_APPROVAL' | 'NOT_EXECUTED';

export interface DecisionReason {
  field: string;
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  weight: number;
}

// ─── LLM Call Metadata ───
export interface LLMCallMetadata {
  provider: string;
  model: string;
  latencyMs: number;
  mode: 'LIVE' | 'FALLBACK';
  timestamp: string;
  operation: string;
}

// ─── Source of Truth ───
export interface SourceDiscrepancy {
  field: string;
  agentClaimed: string | number;
  verified: string | number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  percentDiff?: number;
}

export interface SourceOfTruthResult {
  verified: boolean;
  productId: string;
  agentClaimedMerchant: string;
  verifiedMerchant?: string;
  agentClaimedPrice: number;
  verifiedPrice?: number;
  discrepancies: SourceDiscrepancy[];
  verifiedProduct?: Product;
  error?: string;
  timestamp: string;
}

// ─── Authorization Token ───
// HMAC-SHA256 signed, binds exact transaction fields
export interface AuthorizationToken {
  tokenId: string;
  sessionId: string;
  intentId: string;
  transactionId: string;
  merchantId: string;
  productIds: string[];
  amount: number;
  currency: string;
  quantity: number;
  shippingAddressId: string;
  decision: Decision;
  signature: string; // HMAC-SHA256 hex
  issuedAt: string;
  expiresAt: string;
  consumed: boolean;
}

// ─── Transaction Decision ───
export interface TransactionDecision {
  transactionId: string;
  intentId: string;
  decision: Decision;
  riskScore: number;
  reasons: DecisionReason[];
  paymentCall: PaymentCallState;
  razorpayOrderId?: string;
  authToken?: AuthorizationToken;
  sourceOfTruthResult?: SourceOfTruthResult;
  llmMeta?: LLMCallMetadata;
  timestamp: string;
}

// ─── Firewall Outcome ───
// PASS: clean content
// SANITIZE: suspicious but safe content preserved after cleaning
// QUARANTINE: malicious instructions removed; legitimate content returned
// BLOCK: entire response too dangerous to pass through
export type FirewallOutcome = 'PASS' | 'SANITIZE' | 'QUARANTINE' | 'BLOCK';

// ─── Security Event ───
export interface SecurityEvent {
  id: string;
  sessionId: string;
  intentId?: string;
  agentId?: string;
  merchantId?: string;
  transactionId?: string;
  type:
    | 'injection'
    | 'intent_mismatch'
    | 'decision'
    | 'payment'
    | 'sanitization'
    | 'session'
    | 'intent_compiled'
    | 'catalog_search'
    | 'step_up_approval'
    | 'tool_call'
    | 'source_of_truth'
    | 'auth_token';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  message: string;
  metadata: Record<string, unknown>;
  latencyMs?: number;
}

// ─── Context Firewall ───
export interface InjectionClassification {
  isInjection: boolean;
  riskScore: number;
  attackType?: string;
  reason: string;
  recommendedAction: 'PASS' | 'QUARANTINE';
  rawLLMResponse?: string;
}

export interface SanitizationResult {
  sanitized: boolean;
  originalContent: string;
  cleanContent: string;
  securityAnnotation?: {
    blocked: boolean;
    reason: string;
    attackType?: string;
    riskScore?: number;
  };
}

export interface FirewallResult {
  outcome: FirewallOutcome;
  // Legacy compat
  passed: boolean;
  product: Product;
  sanitizationResults: SanitizationResult[];
  injectionDetected: boolean;
  attackTypes: string[];
  quarantinedContent: string[];
  llmAnalysis?: {
    isInjection: boolean;
    riskScore: number;
    attackType?: string;
    reason: string;
    rawResponse?: string;
  };
  llmMeta?: LLMCallMetadata;
}

// ─── Tool Response (MCP-inspired) ───
export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResponse {
  toolName: string;
  input: Record<string, unknown>;
  rawOutput: unknown;
  sanitizedOutput?: unknown;
  firewallResult?: FirewallResult;
  timestamp: string;
  latencyMs: number;
}

// ─── Payment Provider ───
export interface CreateOrderInput {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error?: string;
  provider: 'razorpay' | 'mock';
}

// ─── Demo Scenario ───
export interface DemoScenario {
  id: string;
  name: string;
  description: string;
  userMessage: string;
  expectedDecision: Decision;
  attackType?: string;
  overrides?: {
    maliciousProduct?: boolean;
    mutatedTransaction?: Partial<ProposedTransaction>;
    merchantSwitch?: boolean;
  };
}

// ─── API Request/Response Types ───
export interface CompileIntentRequest {
  sessionId: string;
  userMessage: string;
}

export interface CatalogSearchRequest {
  sessionId: string;
  query: string;
  enableFirewall: boolean;
}

export interface EvaluateTransactionRequest {
  sessionId: string;
  intentId: string;
  transaction: ProposedTransaction;
}

export interface ApproveStepUpRequest {
  sessionId: string;
  transactionId: string;
}

export interface RunScenarioRequest {
  scenarioId: string;
}

// ─── Agent State ───
export interface AgentAction {
  type: 'search' | 'select' | 'propose' | 'tool_call';
  description: string;
  data?: Record<string, unknown>;
  timestamp: string;
  llmMeta?: LLMCallMetadata;
}

export interface AgentState {
  sessionId: string;
  status:
    | 'idle'
    | 'searching'
    | 'selecting'
    | 'proposing'
    | 'awaiting_decision'
    | 'completed'
    | 'blocked';
  actions: AgentAction[];
  selectedProduct?: Product;
  proposedTransaction?: ProposedTransaction;
  toolResponses?: ToolResponse[];
}

// ─── Full Pipeline Result ───
export interface PipelineResult {
  session: Session;
  intentContract: IntentContract;
  firewallResults: FirewallResult[];
  agentState: AgentState;
  decision: TransactionDecision;
  sourceOfTruthResult?: SourceOfTruthResult;
  events: SecurityEvent[];
}
