// ─── Source-of-Truth Verifier ───
// Independently verifies agent's transaction claim against the authoritative
// catalog record. The agent cannot be trusted to report what it is buying.
// SR8: Source-of-truth mismatch cannot be silently ignored.

import { ProposedTransaction, SourceOfTruthResult, SourceDiscrepancy, Product } from '../types';
import { catalogSimulator } from './catalog-simulator';
import { eventLogger } from './event-logger';

// Price mismatch threshold — above this % is critical
const PRICE_MISMATCH_CRITICAL_THRESHOLD = 0.05; // 5%

// ─── Compare a single numeric field ───
function compareNumeric(
  field: string,
  claimed: number,
  verified: number,
  criticalThreshold: number
): SourceDiscrepancy | null {
  if (claimed === verified) return null;

  const diff = Math.abs(verified - claimed);
  const percentDiff = claimed !== 0 ? diff / claimed : 1;

  let severity: SourceDiscrepancy['severity'] = 'low';
  if (percentDiff > criticalThreshold * 2) severity = 'critical';
  else if (percentDiff > criticalThreshold) severity = 'high';
  else if (percentDiff > criticalThreshold * 0.5) severity = 'medium';

  return {
    field,
    agentClaimed: claimed,
    verified,
    severity,
    percentDiff,
  };
}

// ─── Compare string fields ───
function compareString(
  field: string,
  claimed: string,
  verified: string,
  severity: SourceDiscrepancy['severity'] = 'critical'
): SourceDiscrepancy | null {
  if (claimed.toLowerCase() === verified.toLowerCase()) return null;
  return { field, agentClaimed: claimed, verified, severity };
}

// ─── Main Verification Function ───
export async function verifyAgainstSourceOfTruth(
  transaction: ProposedTransaction,
  sessionId: string
): Promise<SourceOfTruthResult> {
  const startTime = Date.now();
  const productId = transaction.productIds[0];

  const result: SourceOfTruthResult = {
    verified: false,
    productId,
    agentClaimedMerchant: transaction.merchantName,
    agentClaimedPrice: transaction.amount,
    discrepancies: [],
    timestamp: new Date().toISOString(),
  };

  if (!productId) {
    result.error = 'No product ID in transaction — cannot verify';

    eventLogger.log({
      sessionId,
      transactionId: transaction.id,
      type: 'source_of_truth',
      severity: 'high',
      message: 'Source-of-truth: Cannot verify — no product ID',
      metadata: { transaction },
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  // Independent fetch — do NOT use agent-reported data
  const verifiedProduct: Product | undefined = catalogSimulator.getProduct(productId);

  if (!verifiedProduct) {
    result.error = `Product ID ${productId} not found in catalog`;
    result.discrepancies.push({
      field: 'product_id',
      agentClaimed: productId,
      verified: 'NOT_FOUND',
      severity: 'critical',
    });

    eventLogger.log({
      sessionId,
      transactionId: transaction.id,
      type: 'source_of_truth',
      severity: 'critical',
      message: `Source-of-truth: Product ${productId} not found in catalog`,
      metadata: { productId, transaction },
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  result.verifiedProduct = verifiedProduct;
  result.verifiedMerchant = verifiedProduct.merchantName;
  result.verifiedPrice = verifiedProduct.price;

  // ─── Compare fields ───
  const discrepancies: SourceDiscrepancy[] = [];

  // Price check
  const priceDisc = compareNumeric(
    'price',
    transaction.amount,
    verifiedProduct.price,
    PRICE_MISMATCH_CRITICAL_THRESHOLD
  );
  if (priceDisc) discrepancies.push(priceDisc);

  // Merchant ID check
  const merchantIdDisc = compareString(
    'merchantId',
    transaction.merchantId,
    verifiedProduct.merchantId,
    'critical'
  );
  if (merchantIdDisc) discrepancies.push(merchantIdDisc);

  // Merchant Name check
  const merchantNameDisc = compareString(
    'merchantName',
    transaction.merchantName,
    verifiedProduct.merchantName,
    'critical'
  );
  if (merchantNameDisc) discrepancies.push(merchantNameDisc);

  // Currency check
  const currencyDisc = compareString(
    'currency',
    transaction.currency,
    verifiedProduct.currency,
    'critical'
  );
  if (currencyDisc) discrepancies.push(currencyDisc);

  // Category check (medium severity — product might be correct)
  if (transaction.category && verifiedProduct.category) {
    const catDisc = compareString(
      'category',
      transaction.category,
      verifiedProduct.category,
      'medium'
    );
    if (catDisc) discrepancies.push(catDisc);
  }

  result.discrepancies = discrepancies;
  result.verified = discrepancies.length === 0;

  const hasCritical = discrepancies.some(d => d.severity === 'critical');
  const hasHigh = discrepancies.some(d => d.severity === 'high');

  eventLogger.log({
    sessionId,
    transactionId: transaction.id,
    type: 'source_of_truth',
    severity: hasCritical ? 'critical' : hasHigh ? 'high' : discrepancies.length > 0 ? 'medium' : 'info',
    message: result.verified
      ? `Source-of-truth: Verified — agent claim matches catalog record`
      : `Source-of-truth: MISMATCH — ${discrepancies.length} discrepancies found (${discrepancies.map(d => d.field).join(', ')})`,
    metadata: {
      productId,
      verifiedPrice: verifiedProduct.price,
      agentClaimedPrice: transaction.amount,
      verifiedMerchant: verifiedProduct.merchantName,
      agentClaimedMerchant: transaction.merchantName,
      discrepancies,
      verified: result.verified,
    },
    latencyMs: Date.now() - startTime,
  });

  return result;
}
