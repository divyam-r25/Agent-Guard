// ─── AgentGuard Security Tests ───
// Standalone test script proving the authorization token payment gate
// and source-of-truth verification work correctly.
//
// Run with: npx tsx apps/api/src/tests/security-tests.ts

import {
  issueAuthToken,
  verifyAuthToken,
  consumeToken,
  resetAuthTokenStore,
  getToken,
} from '../services/auth-token';
import { verifyAgainstSourceOfTruth } from '../services/source-of-truth';
import { evaluateTransaction } from '../services/policy-engine';
import { eventLogger } from '../services/event-logger';
import {
  ProposedTransaction,
  IntentContract,
  Decision,
} from '../types';

// ─── Test Helpers ───
let passed = 0;
let failed = 0;
const results: { name: string; status: 'PASS' | 'FAIL'; detail?: string }[] = [];

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    results.push({ name: testName, status: 'PASS' });
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    results.push({ name: testName, status: 'FAIL', detail });
    console.log(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── Fixture Builders ───
function makeIntent(overrides?: Partial<IntentContract>): IntentContract {
  return {
    id: 'intent_test_001',
    sessionId: 'session_test',
    originalRequest: 'Buy blue running shoes under ₹3,000',
    maxAmount: 3000,
    currency: 'INR',
    quantityMax: 1,
    budgetType: 'exact',
    budgetConfidence: 0.95,
    quantityConfidence: 0.95,
    authorizationCertainty: 'high',
    productConstraints: { category: 'footwear' },
    addressPolicy: 'default_address',
    authorizationScope: 'single_purchase',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTransaction(overrides?: Partial<ProposedTransaction>): ProposedTransaction {
  return {
    id: 'txn_test_001',
    intentId: 'intent_test_001',
    merchantId: 'merchant_demo_001',
    merchantName: 'Nike Demo Store',
    productIds: ['prod_001'],
    productNames: ['Blue Running Shoes'],
    amount: 2799,
    currency: 'INR',
    quantity: 1,
    shippingAddressId: 'addr_default',
    agentId: 'test-agent',
    sessionId: 'session_test',
    category: 'footwear',
    ...overrides,
  };
}

// ═══════════════════════════════════════════
//  TEST SUITE: Authorization Token Payment Gate
// ═══════════════════════════════════════════

async function runAuthTokenTests() {
  console.log('\n═══ Authorization Token Payment Gate Tests ═══\n');

  // Reset state
  resetAuthTokenStore();
  eventLogger.reset();

  const intent = makeIntent();
  const txn = makeTransaction();

  // ─── A. Valid ALLOW path ───
  {
    const token = issueAuthToken('ALLOW', txn, intent);
    const result = verifyAuthToken(token.tokenId, txn, intent.id);
    assert(result.valid === true, 'A. Valid ALLOW path — token verifies');
    assert(result.token !== undefined, 'A. Valid ALLOW path — token returned');
    // Consume it
    consumeToken(token.tokenId, txn.sessionId, txn.id);
    const consumed = getToken(token.tokenId);
    assert(consumed?.consumed === true, 'A. Valid ALLOW path — token consumed');
  }

  // ─── B. No token (payment attempt without token) ───
  {
    const result = verifyAuthToken('nonexistent_token', txn, intent.id);
    assert(result.valid === false, 'B. No token — rejected');
    assert(result.reason === 'Token not found', 'B. No token — correct reason');
  }

  // ─── C. Fake token ───
  {
    const result = verifyAuthToken('tok_fake123456', txn, intent.id);
    assert(result.valid === false, 'C. Fake token — rejected');
    assert(result.reason === 'Token not found', 'C. Fake token — correct reason');
  }

  // ─── D. Expired token ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    // Manually expire it by changing expiresAt in the store
    const stored = getToken(token.tokenId);
    if (stored) {
      stored.expiresAt = new Date(Date.now() - 60000).toISOString(); // 1 min ago
    }
    const result = verifyAuthToken(token.tokenId, txn, intent.id);
    assert(result.valid === false, 'D. Expired token — rejected');
    assert(result.reason === 'Token expired', 'D. Expired token — correct reason');
  }

  // ─── E. Consumed token (replay attack) ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    consumeToken(token.tokenId, txn.sessionId, txn.id);
    const result = verifyAuthToken(token.tokenId, txn, intent.id);
    assert(result.valid === false, 'E. Consumed token — rejected');
    assert(result.reason === 'Token already consumed', 'E. Consumed token — correct reason');
  }

  // ─── F. Amount mutation ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    const mutatedTxn = makeTransaction({ amount: 9999 });
    const result = verifyAuthToken(token.tokenId, mutatedTxn, intent.id);
    assert(result.valid === false, 'F. Amount mutation — rejected');
    assert(result.reason?.includes('amount') === true, 'F. Amount mutation — field identified');
  }

  // ─── G. Merchant mutation ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    const mutatedTxn = makeTransaction({ merchantId: 'merchant_evil' });
    const result = verifyAuthToken(token.tokenId, mutatedTxn, intent.id);
    assert(result.valid === false, 'G. Merchant mutation — rejected');
    assert(result.reason?.includes('merchantId') === true, 'G. Merchant mutation — field identified');
  }

  // ─── H. Quantity mutation ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    const mutatedTxn = makeTransaction({ quantity: 10 });
    const result = verifyAuthToken(token.tokenId, mutatedTxn, intent.id);
    assert(result.valid === false, 'H. Quantity mutation — rejected');
    assert(result.reason?.includes('quantity') === true, 'H. Quantity mutation — field identified');
  }

  // ─── I. Address mutation ───
  {
    resetAuthTokenStore();
    const token = issueAuthToken('ALLOW', txn, intent);
    const mutatedTxn = makeTransaction({ shippingAddressId: 'addr_evil_789' });
    const result = verifyAuthToken(token.tokenId, mutatedTxn, intent.id);
    assert(result.valid === false, 'I. Address mutation — rejected');
    assert(result.reason?.includes('shippingAddressId') === true, 'I. Address mutation — field identified');
  }
}

// ═══════════════════════════════════════════
//  TEST SUITE: Source-of-Truth Verification
// ═══════════════════════════════════════════

async function runSourceOfTruthTests() {
  console.log('\n═══ Source-of-Truth Verification Tests ═══\n');

  // ─── J. Price mismatch ───
  {
    // prod_001 costs ₹2,799 but transaction claims ₹1,500
    const txn = makeTransaction({ amount: 1500 });
    const result = await verifyAgainstSourceOfTruth(txn, 'session_sot_j');
    assert(result.verified === false, 'J. SoT price mismatch — not verified');
    const priceDisc = result.discrepancies.find(d => d.field.startsWith('amount'));
    assert(priceDisc !== undefined, 'J. SoT price mismatch — discrepancy found');
  }

  // ─── K. Merchant mismatch ───
  {
    // prod_001 belongs to merchant_demo_001 / Nike Demo Store
    // but transaction claims merchant_mal_001 / ShadyDeals
    const txn = makeTransaction({
      merchantId: 'merchant_mal_001',
      merchantName: 'ShadyDeals Marketplace',
    });
    const result = await verifyAgainstSourceOfTruth(txn, 'session_sot_k');
    assert(result.verified === false, 'K. SoT merchant mismatch — not verified');
    const merchDisc = result.discrepancies.find(d => d.field.includes('merchantId'));
    assert(merchDisc !== undefined, 'K. SoT merchant mismatch — discrepancy found');
    assert(merchDisc?.severity === 'critical', 'K. SoT merchant mismatch — critical severity');
  }

  // ─── L. Missing product ───
  {
    const txn = makeTransaction({ productIds: ['prod_nonexistent'] });
    const result = await verifyAgainstSourceOfTruth(txn, 'session_sot_l');
    assert(result.verified === false, 'L. Missing product — not verified');
    const prodDisc = result.discrepancies.find(d => d.field === 'product_id');
    assert(prodDisc !== undefined, 'L. Missing product — discrepancy found');
    assert(prodDisc?.severity === 'critical', 'L. Missing product — critical severity');
  }

  // ─── Bonus: Clean verification ───
  {
    const txn = makeTransaction(); // prod_001 at ₹2,799 from merchant_demo_001
    const result = await verifyAgainstSourceOfTruth(txn, 'session_sot_clean');
    assert(result.verified === true, 'SoT clean verification — passes');
    assert(result.discrepancies.length === 0, 'SoT clean verification — no discrepancies');
  }
}

// ═══════════════════════════════════════════
//  TEST SUITE: Attack Lab Scenario Decisions
// ═══════════════════════════════════════════

async function runScenarioDecisionTests() {
  console.log('\n═══ Attack Lab Scenario Decision Tests ═══\n');

  // ─── M. Clean Purchase → ALLOW ───
  {
    const intent = makeIntent();
    const txn = makeTransaction();
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_m');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_m',
      injectionDetectedInSession: false,
      sourceOfTruthResult: sot,
    });
    assert(decision.decision === 'ALLOW', 'M. Clean Purchase — ALLOW');
  }

  // ─── N. Catalog Injection (firewall catches injection, transaction is clean) → ALLOW ───
  {
    // Scenario B: injection is in product description, but the transaction itself
    // uses prod_001 data which is clean. Firewall quarantines, transaction proceeds.
    const intent = makeIntent({ maxAmount: 5000 });
    const txn = makeTransaction();
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_n');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_n',
      injectionDetectedInSession: true, // firewall detected
      sourceOfTruthResult: sot,
    });
    // With injection detected but clean transaction, score stays low
    assert(decision.decision === 'ALLOW', 'N. Catalog Injection (clean txn) — ALLOW');
  }

  // ─── O. Transaction Mutation → BLOCK ───
  {
    const intent = makeIntent();
    const txn = makeTransaction({
      merchantId: 'merchant_mal_001',
      merchantName: 'Unknown Demo Marketplace',
      productIds: ['prod_006', 'prod_006', 'prod_006', 'prod_006'],
      productNames: ['Red Running Shoes Pro', 'Red Running Shoes Pro', 'Red Running Shoes Pro', 'Red Running Shoes Pro'],
      amount: 11899,
      quantity: 4,
      shippingAddressId: 'addr_alt_001',
    });
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_o');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_o',
      injectionDetectedInSession: false,
      sourceOfTruthResult: sot,
    });
    assert(decision.decision === 'BLOCK', 'O. Transaction Mutation — BLOCK');
  }

  // ─── P. Borderline Amount → STEP_UP ───
  {
    const intent = makeIntent({ maxAmount: 5000, productConstraints: { category: 'electronics' } });
    const txn = makeTransaction({
      id: 'txn_test_p',
      intentId: 'intent_test_001',
      merchantId: 'merchant_demo_002',
      merchantName: 'AudioTech India',
      productIds: ['prod_005'],
      productNames: ['Smart Fitness Watch'],
      amount: 5400,
      quantity: 1,
      category: 'electronics',
    });
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_p');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_p',
      injectionDetectedInSession: false,
      sourceOfTruthResult: sot,
    });
    assert(decision.decision === 'STEP_UP', `P. Borderline Amount — STEP_UP (got ${decision.decision}, score ${decision.riskScore})`);
  }

  // ─── Q. Merchant Switch → BLOCK ───
  {
    const intent = makeIntent({
      maxAmount: 10000,
      merchantConstraints: { allowedMerchants: ['merchant_demo_001'] },
    });
    const txn = makeTransaction({
      merchantId: 'merchant_mal_001',
      merchantName: 'ShadyDeals Marketplace',
      productIds: ['prod_mal_001'],
      productNames: ['Blue Running Shoes Ultra'],
      amount: 2999,
    });
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_q');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_q',
      injectionDetectedInSession: false,
      sourceOfTruthResult: sot,
    });
    assert(decision.decision === 'BLOCK', 'Q. Merchant Switch — BLOCK');
  }

  // ─── R. Address Mutation → BLOCK ───
  {
    const intent = makeIntent({ maxAmount: 4000 });
    const txn = makeTransaction({
      amount: 3499,
      shippingAddressId: 'addr_unknown_789',
    });
    const sot = await verifyAgainstSourceOfTruth(txn, 'session_r');
    const decision = evaluateTransaction(txn, intent, {
      sessionId: 'session_r',
      injectionDetectedInSession: false,
      sourceOfTruthResult: sot,
    });
    assert(decision.decision === 'BLOCK', `R. Address Mutation — BLOCK (got ${decision.decision}, score ${decision.riskScore})`);
  }
}

// ═══════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🛡️  AgentGuard Security Test Suite  🛡️      ║');
  console.log('╚══════════════════════════════════════════════╝');

  await runAuthTokenTests();
  await runSourceOfTruthTests();
  await runScenarioDecisionTests();

  console.log('\n═══ RESULTS ═══\n');
  console.log(`  Total: ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n  FAILED TESTS:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    ❌ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
    process.exit(1);
  } else {
    console.log('\n  ✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
