// ─── Intent Firewall ───
// Evaluates proposed transactions against the Intent Contract
// Per PRD Section 12

import { IntentContract, ProposedTransaction, DecisionReason } from '../types';
import { RISK_WEIGHTS, STEP_UP_AMOUNT_TOLERANCE, BLOCK_AMOUNT_MULTIPLIER } from '../config/policy';

export interface IntentComparisonResult {
  totalRiskScore: number;
  reasons: DecisionReason[];
  violationCount: number;
}

export function compareTransactionToIntent(
  transaction: ProposedTransaction,
  intent: IntentContract
): IntentComparisonResult {
  const reasons: DecisionReason[] = [];
  let rawScore = 0;

  // ─── Amount Check ───
  if (intent.maxAmount !== undefined && intent.maxAmount !== null) {
    if (transaction.amount > intent.maxAmount) {
      const overage = transaction.amount - intent.maxAmount;
      const overageRatio = overage / intent.maxAmount;

      let severity: DecisionReason['severity'] = 'medium';
      let weight = RISK_WEIGHTS.AMOUNT_OVER_MAX;

      if (overageRatio > (BLOCK_AMOUNT_MULTIPLIER - 1)) {
        severity = 'critical';
        weight = RISK_WEIGHTS.AMOUNT_OVER_MAX * 1.5;
      } else if (overageRatio > STEP_UP_AMOUNT_TOLERANCE) {
        severity = 'high';
        weight = RISK_WEIGHTS.AMOUNT_OVER_MAX;
      } else {
        severity = 'medium';
        weight = RISK_WEIGHTS.AMOUNT_OVER_MAX * 0.7; // Ensure any overage triggers at least STEP-UP
      }

      reasons.push({
        field: 'amount',
        expected: `<= ₹${intent.maxAmount.toLocaleString('en-IN')}`,
        actual: `₹${transaction.amount.toLocaleString('en-IN')} (+₹${overage.toLocaleString('en-IN')})`,
        severity,
        weight,
      });
      rawScore += weight;
    }
  }

  // ─── Currency Check ───
  if (intent.currency && transaction.currency !== intent.currency) {
    reasons.push({
      field: 'currency',
      expected: intent.currency,
      actual: transaction.currency,
      severity: 'critical',
      weight: RISK_WEIGHTS.CURRENCY_MISMATCH,
    });
    rawScore += RISK_WEIGHTS.CURRENCY_MISMATCH;
  }

  // ─── Quantity Check ───
  if (intent.quantityMax !== undefined && intent.quantityMax !== null) {
    if (transaction.quantity > intent.quantityMax) {
      const qtyOver = transaction.quantity - intent.quantityMax;
      let severity: DecisionReason['severity'] = 'medium';
      let weight = RISK_WEIGHTS.QUANTITY_OVER_LIMIT;

      if (transaction.quantity >= intent.quantityMax * 3) {
        severity = 'critical';
        weight = RISK_WEIGHTS.QUANTITY_OVER_LIMIT * 1.5;
      } else if (qtyOver > 1) {
        severity = 'high';
      }

      reasons.push({
        field: 'quantity',
        expected: `<= ${intent.quantityMax}`,
        actual: `${transaction.quantity}`,
        severity,
        weight,
      });
      rawScore += weight;
    }
  }

  // ─── Merchant Check ───
  if (intent.merchantConstraints) {
    const { allowedMerchants, blockedMerchants } = intent.merchantConstraints;

    if (allowedMerchants && allowedMerchants.length > 0) {
      const isAllowed = allowedMerchants.some(
        m => m.toLowerCase() === transaction.merchantId.toLowerCase() ||
             m.toLowerCase() === transaction.merchantName.toLowerCase()
      );
      if (!isAllowed) {
        reasons.push({
          field: 'merchant',
          expected: `One of: ${allowedMerchants.join(', ')}`,
          actual: transaction.merchantName,
          severity: 'critical',
          weight: 60,
        });
        rawScore += 60;
      }
    }

    if (blockedMerchants && blockedMerchants.length > 0) {
      const isBlocked = blockedMerchants.some(
        m => m.toLowerCase() === transaction.merchantId.toLowerCase() ||
             m.toLowerCase() === transaction.merchantName.toLowerCase()
      );
      if (isBlocked) {
        reasons.push({
          field: 'merchant',
          expected: `Not: ${blockedMerchants.join(', ')}`,
          actual: transaction.merchantName,
          severity: 'critical',
          weight: RISK_WEIGHTS.MERCHANT_MISMATCH * 1.5,
        });
        rawScore += RISK_WEIGHTS.MERCHANT_MISMATCH * 1.5;
      }
    }
  }

  // ─── Product/Category Check ───
  if (intent.productConstraints?.category && transaction.category) {
    if (transaction.category.toLowerCase() !== intent.productConstraints.category.toLowerCase()) {
      reasons.push({
        field: 'category',
        expected: intent.productConstraints.category,
        actual: transaction.category,
        severity: 'medium',
        weight: RISK_WEIGHTS.PRODUCT_CATEGORY_MISMATCH,
      });
      rawScore += RISK_WEIGHTS.PRODUCT_CATEGORY_MISMATCH;
    }
  }

  // ─── Address Check ───
  if (intent.addressPolicy === 'default_address' && transaction.shippingAddressId !== 'addr_default') {
    reasons.push({
      field: 'shipping_address',
      expected: 'Default address (addr_default)',
      actual: transaction.shippingAddressId,
      severity: 'medium',
      weight: RISK_WEIGHTS.ADDRESS_MISMATCH,
    });
    rawScore += RISK_WEIGHTS.ADDRESS_MISMATCH;
  }

  // ─── Multiple Violations Bonus ───
  if (reasons.length >= 2) {
    rawScore += RISK_WEIGHTS.MULTIPLE_VIOLATIONS_BONUS;
  }

  // Normalize to 0-100
  const totalRiskScore = Math.min(Math.round(rawScore), 100);

  return {
    totalRiskScore,
    reasons,
    violationCount: reasons.length,
  };
}
