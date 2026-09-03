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
// Iterates through ALL product IDs in the transaction, verifies each one,
// and computes trusted total amount (unitPrice × quantity).
export async function verifyAgainstSourceOfTruth(
  transaction: ProposedTransaction,
  sessionId: string
): Promise<SourceOfTruthResult> {
  const startTime = Date.now();
  // Use first product ID as the primary identifier for backward compatibility
  const primaryProductId = transaction.productIds[0] || '';

  const result: SourceOfTruthResult = {
    verified: false,
    productId: primaryProductId,
    agentClaimedMerchant: transaction.merchantName,
    agentClaimedPrice: transaction.amount,
    discrepancies: [],
    timestamp: new Date().toISOString(),
  };

  if (transaction.productIds.length === 0 || !primaryProductId) {
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

  // ─── Verify EVERY product in the transaction ───
  // Deduplicate product IDs for verification (a transaction may have the same
  // product ID repeated for quantity, e.g. scenario_c has prod_006 ×4)
  const uniqueProductIds = Array.from(new Set(transaction.productIds));
  const allDiscrepancies: SourceDiscrepancy[] = [];
  let trustedUnitTotal = 0;
  let allProductsFound = true;
  let primaryVerifiedProduct: Product | undefined;

  for (const productId of uniqueProductIds) {
    // Independent fetch — do NOT use agent-reported data
    const verifiedProduct: Product | undefined = catalogSimulator.getProduct(productId);

    if (!verifiedProduct) {
      allProductsFound = false;
      allDiscrepancies.push({
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

      continue;
    }

    // Track primary product for backward-compatible result fields
    if (productId === primaryProductId) {
      primaryVerifiedProduct = verifiedProduct;
      result.verifiedProduct = verifiedProduct;
      result.verifiedMerchant = verifiedProduct.merchantName;
      result.verifiedPrice = verifiedProduct.price;
    }

    // Count how many times this product appears in the transaction
    const productCount = transaction.productIds.filter(id => id === productId).length;
    trustedUnitTotal += verifiedProduct.price * productCount;

    // ─── Per-product field comparisons ───

    // Merchant ID check
    const merchantIdDisc = compareString(
      `merchantId[${productId}]`,
      transaction.merchantId,
      verifiedProduct.merchantId,
      'critical'
    );
    if (merchantIdDisc) allDiscrepancies.push(merchantIdDisc);

    // Merchant Name check
    const merchantNameDisc = compareString(
      `merchantName[${productId}]`,
      transaction.merchantName,
      verifiedProduct.merchantName,
      'critical'
    );
    if (merchantNameDisc) allDiscrepancies.push(merchantNameDisc);

    // Currency check
    const currencyDisc = compareString(
      `currency[${productId}]`,
      transaction.currency,
      verifiedProduct.currency,
      'critical'
    );
    if (currencyDisc) allDiscrepancies.push(currencyDisc);

    // Category check (medium severity — product might be correct)
    if (transaction.category && verifiedProduct.category) {
      const catDisc = compareString(
        `category[${productId}]`,
        transaction.category,
        verifiedProduct.category,
        'medium'
      );
      if (catDisc) allDiscrepancies.push(catDisc);
    }

    // Product name check (where available)
    const txnProductIndex = transaction.productIds.indexOf(productId);
    if (txnProductIndex >= 0 && transaction.productNames[txnProductIndex]) {
      const nameDisc = compareString(
        `productName[${productId}]`,
        transaction.productNames[txnProductIndex],
        verifiedProduct.name,
        'medium'
      );
      if (nameDisc) allDiscrepancies.push(nameDisc);
    }
  }

  // ─── Amount verification: trusted total vs claimed amount ───
  // trustedTotal = sum of (verifiedUnitPrice × count) for each unique product
  if (allProductsFound && trustedUnitTotal > 0) {
    const amountDisc = compareNumeric(
      'amount',
      transaction.amount,
      trustedUnitTotal,
      PRICE_MISMATCH_CRITICAL_THRESHOLD
    );
    if (amountDisc) allDiscrepancies.push(amountDisc);
  }

  // ─── Deduplicate discrepancies by field name ───
  // When a product appears multiple times, we only need one discrepancy per field
  const seenFields = new Set<string>();
  const dedupedDiscrepancies: SourceDiscrepancy[] = [];
  for (const disc of allDiscrepancies) {
    // Normalize field name for dedup (strip product ID suffix)
    const baseField = disc.field.replace(/\[.*?\]/, '');
    const key = `${baseField}:${disc.agentClaimed}:${disc.verified}`;
    if (!seenFields.has(key)) {
      seenFields.add(key);
      dedupedDiscrepancies.push(disc);
    }
  }

  result.discrepancies = dedupedDiscrepancies;
  result.verified = dedupedDiscrepancies.length === 0;

  const hasCritical = dedupedDiscrepancies.some(d => d.severity === 'critical');
  const hasHigh = dedupedDiscrepancies.some(d => d.severity === 'high');

  eventLogger.log({
    sessionId,
    transactionId: transaction.id,
    type: 'source_of_truth',
    severity: hasCritical ? 'critical' : hasHigh ? 'high' : dedupedDiscrepancies.length > 0 ? 'medium' : 'info',
    message: result.verified
      ? `Source-of-truth: Verified — agent claim matches catalog record`
      : `Source-of-truth: MISMATCH — ${dedupedDiscrepancies.length} discrepancies found (${dedupedDiscrepancies.map(d => d.field).join(', ')})`,
    metadata: {
      productIds: transaction.productIds,
      verifiedPrice: result.verifiedPrice,
      trustedTotal: trustedUnitTotal,
      agentClaimedPrice: transaction.amount,
      verifiedMerchant: result.verifiedMerchant,
      agentClaimedMerchant: transaction.merchantName,
      discrepancies: dedupedDiscrepancies,
      verified: result.verified,
    },
    latencyMs: Date.now() - startTime,
  });

  return result;
}
