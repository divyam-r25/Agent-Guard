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

// Token secret — never exposed to client
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'agentguard-dev-secret-do-not-use-in-prod';
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
    token.productIds.sort().join(','),
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
    productIds: transaction.productIds,
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

  console.log(
    JSON.stringify({
      level: 'INFO',
      type: 'auth_token_issued',
      tokenId: token.tokenId,
      transactionId: token.transactionId,
      amount: token.amount,
      expiresAt: token.expiresAt,
    })
  );

  return token;
}

// ─── Verify Token ───
export function verifyAuthToken(
  tokenId: string,
  transaction: ProposedTransaction
): { valid: boolean; reason?: string; token?: AuthorizationToken } {
  const stored = authTokenStore.get(tokenId);

  if (!stored) {
    return { valid: false, reason: 'Token not found' };
  }

  if (stored.consumed) {
    return { valid: false, reason: 'Token already consumed' };
  }

  const now = new Date();
  if (now > new Date(stored.expiresAt)) {
    return { valid: false, reason: 'Token expired' };
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
    return { valid: false, reason: 'Token signature invalid' };
  }

  // Verify binding — must match exact transaction fields
  const mutations: string[] = [];

  if (stored.transactionId !== transaction.id) mutations.push('transactionId');
  if (stored.merchantId !== transaction.merchantId) mutations.push('merchantId');
  if (stored.amount !== transaction.amount) mutations.push('amount');
  if (stored.currency !== transaction.currency) mutations.push('currency');
  if (stored.quantity !== transaction.quantity) mutations.push('quantity');
  if (stored.shippingAddressId !== transaction.shippingAddressId) mutations.push('shippingAddressId');

  if (mutations.length > 0) {
    return {
      valid: false,
      reason: `Transaction mutated after authorization. Modified fields: ${mutations.join(', ')}`,
    };
  }

  return { valid: true, token: stored };
}

// ─── Consume Token (single-use) ───
export function consumeToken(tokenId: string): void {
  const stored = authTokenStore.get(tokenId);
  if (stored) {
    stored.consumed = true;
    authTokenStore.set(tokenId, stored);
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
