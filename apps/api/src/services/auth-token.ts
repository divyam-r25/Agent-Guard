// ─── Authorization Token Service ───
// Issues and verifies HMAC-SHA256 signed authorization tokens
// that bind a payment decision to exact transaction fields.
// SR1-SR6: No payment without valid server-side authorization.

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthorizationToken,
  TransactionDecision,
  ProposedTransaction,
  IntentContract,
  Decision,
} from '../types';
import { eventLogger } from './event-logger';

// ─── Token Secret ───
// In production (NODE_ENV=production), AUTH_TOKEN_SECRET MUST be set.
// In development, a fallback secret is used for convenience.
const DEV_FALLBACK_SECRET = 'agentguard-dev-secret-do-not-use-in-prod';

function resolveTokenSecret(): string {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[SECURITY] FATAL: AUTH_TOKEN_SECRET is not set in production. ' +
      'Payment authorization tokens cannot be signed securely. ' +
      'Set AUTH_TOKEN_SECRET in your environment variables.'
    );
    throw new Error('AUTH_TOKEN_SECRET is required in production');
  }

  // Development fallback — never used in production
  return DEV_FALLBACK_SECRET;
}

const TOKEN_SECRET = resolveTokenSecret();
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Server-side token store
const authTokenStore = new Map<string, AuthorizationToken>();

// ─── Build canonical payload for signing ───
function buildPayload(token: Omit<AuthorizationToken, 'signature' | 'consumed'>): string {
  return [
    token.tokenId,
    token.sessionId,
    token.intentId,
    token.transactionId,
    token.merchantId,
    // Non-mutating sort — never modify the original array
    [...token.productIds].sort().join(','),
    token.amount.toString(),
    token.currency,
    token.quantity.toString(),
    token.shippingAddressId,
    token.decision,
    token.issuedAt,
    token.expiresAt,
  ].join('|');
}

// ─── Sign payload with HMAC-SHA256 ───
function signPayload(payload: string): string {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
}

// ─── Issue Authorization Token ───
export function issueAuthToken(
  decision: Decision,
  transaction: ProposedTransaction,
  intent: IntentContract
): AuthorizationToken {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  const tokenBase: Omit<AuthorizationToken, 'signature' | 'consumed'> = {
    tokenId: `tok_${uuidv4().slice(0, 12)}`,
    sessionId: transaction.sessionId,
    intentId: intent.id,
    transactionId: transaction.id,
    merchantId: transaction.merchantId,
    productIds: [...transaction.productIds], // defensive copy
    amount: transaction.amount,
    currency: transaction.currency,
    quantity: transaction.quantity,
    shippingAddressId: transaction.shippingAddressId,
    decision,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const payload = buildPayload(tokenBase);
  const signature = signPayload(payload);

  const token: AuthorizationToken = {
    ...tokenBase,
    signature,
    consumed: false,
  };

  authTokenStore.set(token.tokenId, token);

  eventLogger.log({
    sessionId: token.sessionId,
    intentId: token.intentId,
    transactionId: token.transactionId,
    type: 'auth_token',
    severity: 'info',
    message: `Authorization token issued: ${token.tokenId} for transaction ${token.transactionId} (₹${token.amount} ${token.currency})`,
    metadata: {
      event: 'auth_token_issued',
      tokenId: token.tokenId,
      transactionId: token.transactionId,
      amount: token.amount,
      currency: token.currency,
      decision: token.decision,
      expiresAt: token.expiresAt,
    },
  });

  return token;
}

// ─── Verify Token ───
// Full binding verification: every field must match the proposed transaction.
export function verifyAuthToken(
  tokenId: string,
  transaction: ProposedTransaction,
  intentId: string
): { valid: boolean; reason?: string; token?: AuthorizationToken } {
  const stored = authTokenStore.get(tokenId);

  if (!stored) {
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, 'Token not found');
    return { valid: false, reason: 'Token not found' };
  }

  if (stored.consumed) {
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, 'Token already consumed');
    return { valid: false, reason: 'Token already consumed' };
  }

  const now = new Date();
  if (now > new Date(stored.expiresAt)) {
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, 'Token expired');
    return { valid: false, reason: 'Token expired' };
  }

  // Decision must be ALLOW — only ALLOW tokens authorize payment
  if (stored.decision !== 'ALLOW') {
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, `Token decision is ${stored.decision}, not ALLOW`);
    return { valid: false, reason: `Token decision is ${stored.decision}, not ALLOW` };
  }

  // Verify HMAC signature
  const payload = buildPayload({
    tokenId: stored.tokenId,
    sessionId: stored.sessionId,
    intentId: stored.intentId,
    transactionId: stored.transactionId,
    merchantId: stored.merchantId,
    productIds: stored.productIds,
    amount: stored.amount,
    currency: stored.currency,
    quantity: stored.quantity,
    shippingAddressId: stored.shippingAddressId,
    decision: stored.decision,
    issuedAt: stored.issuedAt,
    expiresAt: stored.expiresAt,
  });
  const expectedSig = signPayload(payload);

  if (!crypto.timingSafeEqual(Buffer.from(stored.signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, 'Token signature invalid');
    return { valid: false, reason: 'Token signature invalid' };
  }

  // ─── Verify binding — must match exact transaction fields ───
  const mutations: string[] = [];

  if (stored.transactionId !== transaction.id) mutations.push('transactionId');
  if (stored.sessionId !== transaction.sessionId) mutations.push('sessionId');
  if (stored.intentId !== intentId) mutations.push('intentId');
  if (stored.merchantId !== transaction.merchantId) mutations.push('merchantId');
  if (stored.amount !== transaction.amount) mutations.push('amount');
  if (stored.currency !== transaction.currency) mutations.push('currency');
  if (stored.quantity !== transaction.quantity) mutations.push('quantity');
  if (stored.shippingAddressId !== transaction.shippingAddressId) mutations.push('shippingAddressId');

  // Verify all product IDs match (order-independent)
  const storedProductIds = [...stored.productIds].sort().join(',');
  const txnProductIds = [...transaction.productIds].sort().join(',');
  if (storedProductIds !== txnProductIds) mutations.push('productIds');

  if (mutations.length > 0) {
    const reason = `Transaction mutated after authorization. Modified fields: ${mutations.join(', ')}`;
    logTokenFailure(tokenId, transaction.sessionId, transaction.id, reason);
    return { valid: false, reason };
  }

  // ─── Token is valid ───
  eventLogger.log({
    sessionId: transaction.sessionId,
    intentId,
    transactionId: transaction.id,
    type: 'auth_token',
    severity: 'info',
    message: `Authorization token verified: ${tokenId}`,
    metadata: {
      event: 'auth_token_verified',
      tokenId,
      transactionId: transaction.id,
    },
  });

  return { valid: true, token: stored };
}

// ─── Consume Token (single-use) ───
export function consumeToken(tokenId: string, sessionId: string, transactionId: string): void {
  const stored = authTokenStore.get(tokenId);
  if (stored) {
    stored.consumed = true;
    authTokenStore.set(tokenId, stored);

    eventLogger.log({
      sessionId,
      transactionId,
      type: 'auth_token',
      severity: 'info',
      message: `Authorization token consumed: ${tokenId} (single-use enforced)`,
      metadata: {
        event: 'auth_token_consumed',
        tokenId,
        transactionId,
      },
    });
  }
}

// ─── Invalidate Token ───
export function invalidateToken(tokenId: string): void {
  authTokenStore.delete(tokenId);
}

// ─── Get Token (for internal use) ───
export function getToken(tokenId: string): AuthorizationToken | undefined {
  return authTokenStore.get(tokenId);
}

// ─── Reset (for tests) ───
export function resetAuthTokenStore(): void {
  authTokenStore.clear();
}

// ─── Internal: Log token verification failure ───
function logTokenFailure(tokenId: string, sessionId: string, transactionId: string, reason: string): void {
  eventLogger.log({
    sessionId,
    transactionId,
    type: 'auth_token',
    severity: 'critical',
    message: `Authorization token FAILED: ${reason} (tokenId: ${tokenId})`,
    metadata: {
      event: 'auth_token_failed',
      tokenId,
      transactionId,
      reason,
    },
  });
}
