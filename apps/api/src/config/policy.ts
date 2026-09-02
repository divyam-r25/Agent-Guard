// ─── Policy Configuration ───
// Risk scoring weights and decision thresholds for the Policy Engine
// These are prototype values, NOT production Razorpay values.

export const RISK_WEIGHTS = {
  AMOUNT_OVER_MAX: 40,
  MERCHANT_MISMATCH: 25,
  QUANTITY_OVER_LIMIT: 20,
  ADDRESS_MISMATCH: 15,
  PRODUCT_CATEGORY_MISMATCH: 20,
  MULTIPLE_VIOLATIONS_BONUS: 20,
  KNOWN_INJECTION_IN_SESSION: 30,
  CURRENCY_MISMATCH: 50,
};

export const DECISION_THRESHOLDS = {
  ALLOW_MAX: 24,
  STEP_UP_MAX: 59,
  // 60-100 = BLOCK
};

// Amount tolerance for STEP-UP (percentage over limit before BLOCK)
export const STEP_UP_AMOUNT_TOLERANCE = 0.20; // 20% over limit triggers STEP-UP instead of BLOCK
export const BLOCK_AMOUNT_MULTIPLIER = 2.0; // 2x over limit is always BLOCK

// Quantity tolerance
export const STEP_UP_QUANTITY_TOLERANCE = 1; // 1 over limit triggers STEP-UP
export const BLOCK_QUANTITY_MULTIPLIER = 3; // 3x over limit is always BLOCK

export const POLICY_VERSION = '1.0.0-prototype';
