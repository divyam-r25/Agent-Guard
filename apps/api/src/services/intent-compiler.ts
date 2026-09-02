// ─── Intent Compiler ───
// Converts user's natural-language request into a structured Intent Contract V2.
// Adds budgetType, authorizationCertainty, per-field confidence, and Hinglish support.

import { v4 as uuidv4 } from 'uuid';
import { IntentContract, BudgetType, AuthorizationCertainty } from '../types';
import { eventLogger } from './event-logger';

// ─── Ambiguity markers that signal approximate budget ───
const APPROXIMATE_MARKERS = [
  'around', 'approximately', 'about', 'roughly', 'close to',
  'somewhere around', 'near', 'roughly around',
  // Hinglish
  'ke around', 'ke kareeb', 'ke aas paas', 'lagbhag',
];

// ─── Exact budget markers ───
const EXACT_MARKERS = [
  'under', 'below', 'less than', 'max', 'maximum', 'upto', 'up to',
  'within', 'budget', 'not more than', 'ceiling',
  // Hinglish
  'ke andar', 'se kam', 'se zyada nahi',
];

// ─── Soft preference markers ───
const SOFT_MARKERS = ['prefer', 'preferably', 'if possible', 'ideally', 'would like', 'achhe', 'accha', 'badhiya'];

// ─── Detect budget type from message ───
function detectBudgetType(msg: string): BudgetType {
  const lower = msg.toLowerCase();

  // Check approximate first (to catch "around 5k" before "under 5k")
  for (const marker of APPROXIMATE_MARKERS) {
    if (lower.includes(marker)) return 'approximate';
  }

  // Check exact
  for (const marker of EXACT_MARKERS) {
    if (lower.includes(marker)) return 'exact';
  }

  // If a number is present without any qualifier
  const hasNumber = /(?:₹|rs\.?|inr)?\s*\d[\d,]*k?/.test(lower);
  if (hasNumber) return 'approximate'; // number without qualifier = approximate

  return 'unknown';
}

// ─── Extract amount ───
function extractAmount(msg: string): number | undefined {
  const lower = msg.toLowerCase();

  // "5k" shorthand
  const kMatch = lower.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)k\b/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  const amountMatch =
    msg.match(/(?:under|below|less than|max|maximum|upto|up to|within|budget|ke andar|se kam|around|approximately|about|near|kareeb)\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i) ||
    msg.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*)/i) ||
    msg.match(/(\d[\d,]+)\s*(?:₹|rs\.?|inr|rupees?)/i);

  if (amountMatch) return parseInt(amountMatch[1].replace(/,/g, ''), 10);
  return undefined;
}

// ─── Deterministic Fallback Parser ───
function parseIntentDeterministic(userMessage: string, sessionId: string): IntentContract {
  const msg = userMessage.toLowerCase();

  const budgetType = detectBudgetType(msg);
  const maxAmount = extractAmount(userMessage);

  // Confidence for budget
  let budgetConfidence = 0.0;
  if (budgetType === 'exact' && maxAmount) budgetConfidence = 0.92;
  else if (budgetType === 'approximate' && maxAmount) budgetConfidence = 0.65;
  else if (budgetType === 'unknown') budgetConfidence = 0.0;

  // Quantity
  let quantityMax: number | undefined = 1;
  let quantityConfidence = 0.85;
  const qtyMatch = msg.match(/(\d+)\s*(?:pair|pairs|unit|units|piece|pieces|item|items)/i);
  if (qtyMatch) {
    quantityMax = parseInt(qtyMatch[1], 10);
    quantityConfidence = 0.95;
  }
  if (/\b(one|a single|1)\s*(pair|unit|piece|item)?\b/i.test(msg)) {
    quantityMax = 1;
    quantityConfidence = 0.97;
  }

  // Category
  let category: string | undefined;
  let categoryConfidence = 0.0;
  const categories: Record<string, string[]> = {
    footwear: ['shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'sandal', 'sandals', 'footwear', 'running shoes', 'jogging shoes', 'juta', 'chappal'],
    electronics: ['earbuds', 'headphone', 'headphones', 'watch', 'phone', 'laptop', 'tablet', 'electronics', 'gadget', 'fitness watch', 'smartwatch'],
    groceries: ['rice', 'oil', 'flour', 'grocery', 'groceries', 'food', 'spice', 'dal'],
    apparel: ['shirt', 'tshirt', 't-shirt', 'jacket', 'jeans', 'pants', 'dress', 'apparel', 'clothing', 'clothes'],
  };

  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(k => msg.includes(k))) {
      category = cat;
      categoryConfidence = 0.88;
      break;
    }
  }

  // Color & attributes
  const colors = ['blue', 'red', 'black', 'white', 'green', 'yellow', 'pink', 'grey', 'gray', 'brown', 'navy', 'indigo'];
  const attributes: Record<string, string> = {};
  for (const color of colors) {
    if (msg.includes(color)) {
      // Check if it's a soft preference
      const isSoft = SOFT_MARKERS.some(m => msg.includes(m));
      attributes['color'] = color;
      if (isSoft) attributes['colorConstraint'] = 'soft';
      break;
    }
  }

  // Merchant constraints
  let merchantConstraints: IntentContract['merchantConstraints'] | undefined;
  const merchantMatch = msg.match(/(?:from|at|on)\s+([A-Z][a-zA-Z\s]+(?:Store|Shop|Market|India|Fashion|Grocers|Hub))/i);
  if (merchantMatch) {
    merchantConstraints = {
      allowedMerchants: [],
      blockedMerchants: [],
      merchantConfidence: 0.75,
    };
    (merchantConstraints as any)._requestedMerchantName = merchantMatch[1].trim();
  }

  // Authorization certainty
  let authorizationCertainty: AuthorizationCertainty = 'none';
  if (budgetType === 'exact' && maxAmount && quantityMax) {
    authorizationCertainty = 'high';
  } else if (budgetType === 'approximate' && maxAmount) {
    authorizationCertainty = 'medium';
  } else if (budgetType === 'unknown' || !maxAmount) {
    authorizationCertainty = 'none';
  }

  const contract: IntentContract = {
    id: `intent_${uuidv4().slice(0, 8)}`,
    sessionId,
    originalRequest: userMessage,
    maxAmount,
    budgetType,
    budgetConfidence,
    currency: 'INR',
    quantityMax,
    quantityConfidence,
    productConstraints: category || Object.keys(attributes).length > 0
      ? { category, attributes: Object.keys(attributes).length > 0 ? attributes : undefined, categoryConfidence }
      : undefined,
    merchantConstraints,
    addressPolicy: 'default_address',
    authorizationScope: 'single_purchase',
    authorizationCertainty,
    userConfirmationRequiredAbove: maxAmount,
    createdAt: new Date().toISOString(),
  };

  return contract;
}

// ─── LLM-Powered Intent Compiler ───
async function compileIntentWithLLM(userMessage: string, sessionId: string): Promise<IntentContract> {
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey || process.env.USE_MOCK_LLM === 'true') {
    return parseIntentDeterministic(userMessage, sessionId);
  }

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const startTime = Date.now();

    const prompt = `You are an intent compiler for a payment security system. Convert the user's natural-language purchase request into a structured Intent Contract.

CRITICAL SECURITY RULES:
1. NEVER infer a hard spending limit from an approximate phrase. "around 5k" ≠ "under 5000".
2. budgetType must be "exact" only when the user uses explicit ceiling words (under, below, max, upto, not more than).
3. budgetType must be "approximate" when the user uses vague estimates (around, about, roughly, ke around).
4. budgetType must be "unknown" when no money amount is mentioned at all.
5. authorizationCertainty = "none" when budget is unknown. Do NOT invent financial authority.
6. Default quantity to 1 unless explicitly stated otherwise.
7. Handle Hinglish naturally: "ke andar" = exact constraint, "ke around" = approximate, "achhe" = soft preference.

User request: "${userMessage}"

Respond with ONLY valid JSON:
{
  "maxAmount": number or null,
  "budgetType": "exact" | "approximate" | "unknown",
  "budgetConfidence": number between 0 and 1,
  "currency": "INR",
  "quantityMax": number,
  "quantityConfidence": number between 0 and 1,
  "productConstraints": {
    "category": string or null,
    "attributes": { "color": string, "colorConstraint": "hard" or "soft" } or null,
    "categoryConfidence": number
  } or null,
  "merchantConstraints": {
    "allowedMerchants": string[],
    "blockedMerchants": [],
    "merchantConfidence": number
  } or null,
  "addressPolicy": "default_address",
  "authorizationScope": "single_purchase",
  "authorizationCertainty": "high" | "medium" | "low" | "none"
}`;

    const response = await ai.models.generateContent({
      model: process.env.LLM_MODEL || 'gemini-2.0-flash',
      contents: prompt,
    });

    const latencyMs = Date.now() - startTime;
    const text = response.text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    if (!text) throw new Error('Empty LLM response');

    const parsed = JSON.parse(text);

    const contract: IntentContract = {
      id: `intent_${uuidv4().slice(0, 8)}`,
      sessionId,
      originalRequest: userMessage,
      maxAmount: parsed.maxAmount,
      budgetType: parsed.budgetType || 'unknown',
      budgetConfidence: parsed.budgetConfidence ?? 0,
      currency: parsed.currency || 'INR',
      quantityMax: parsed.quantityMax || 1,
      quantityConfidence: parsed.quantityConfidence ?? 0.85,
      productConstraints: parsed.productConstraints,
      merchantConstraints: parsed.merchantConstraints,
      addressPolicy: parsed.addressPolicy || 'default_address',
      authorizationScope: parsed.authorizationScope || 'single_purchase',
      authorizationCertainty: parsed.authorizationCertainty || 'none',
      userConfirmationRequiredAbove: parsed.maxAmount,
      createdAt: new Date().toISOString(),
    };

    // Log LLM metadata
    eventLogger.log({
      sessionId,
      intentId: contract.id,
      type: 'intent_compiled',
      severity: 'info',
      message: `Intent compiled via LLM (${latencyMs}ms): budget ${contract.budgetType} ₹${contract.maxAmount || 'unspecified'}, qty ${contract.quantityMax}, certainty: ${contract.authorizationCertainty}`,
      metadata: { contract, latencyMs, llmMode: 'LIVE' },
      latencyMs,
    });

    return contract;
  } catch (error) {
    console.error('LLM intent compilation failed, using deterministic fallback:', error);
    return parseIntentDeterministic(userMessage, sessionId);
  }
}

// ─── Main Export ───
export async function compileIntent(
  userMessage: string,
  sessionId: string
): Promise<IntentContract> {
  const startTime = Date.now();

  const contract = await compileIntentWithLLM(userMessage, sessionId);

  // Log the event (if not already logged by LLM path)
  if (!contract.createdAt || !eventLogger.getEvents(sessionId).find(e => e.type === 'intent_compiled' && e.intentId === contract.id)) {
    eventLogger.log({
      sessionId,
      intentId: contract.id,
      type: 'intent_compiled',
      severity: 'info',
      message: `Intent compiled: budget ${contract.budgetType} ₹${contract.maxAmount || 'unspecified'}, qty ${contract.quantityMax || 'unspecified'}, certainty: ${contract.authorizationCertainty}`,
      metadata: { contract, originalRequest: userMessage },
      latencyMs: Date.now() - startTime,
    });
  }

  return contract;
}

// Export deterministic parser for testing
export { parseIntentDeterministic };
