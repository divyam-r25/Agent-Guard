// ─── Payment Provider ───
// Adapter pattern: RazorpayTestProvider + MockPaymentProvider
// HARD RULE: No payment call without valid server-side authorization token.
// Per PRD Section 14 — Authorization Token is the MANDATORY payment boundary.

import { CreateOrderInput, CreateOrderResult, ProposedTransaction, IntentContract } from '../types';
import { verifyAuthToken, consumeToken } from './auth-token';
import { eventLogger } from './event-logger';

// ─── Payment Provider Interface ───
interface PaymentProvider {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  getOrder(orderId: string): Promise<any>;
}

// ─── Razorpay Test Mode Provider ───
class RazorpayTestProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;

  constructor(keyId: string, keySecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    try {
      // Use Razorpay REST API directly for test mode
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: input.amount * 100, // Razorpay expects paise
          currency: input.currency,
          receipt: input.receipt,
          notes: input.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Razorpay API error: ${response.status} ${error}`);
      }

      const order = (await response.json()) as any;

      return {
        success: true,
        orderId: order.id,
        amount: order.amount / 100, // Convert back to rupees
        currency: order.currency,
        status: order.status,
        provider: 'razorpay',
      };
    } catch (error: any) {
      console.error('Razorpay order creation failed:', error.message);
      return {
        success: false,
        error: error.message,
        provider: 'razorpay',
      };
    }
  }

  async getOrder(orderId: string): Promise<any> {
    try {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');

      const response = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });

      if (!response.ok) throw new Error(`Failed to get order: ${response.status}`);
      return await response.json();
    } catch (error: any) {
      return { error: error.message };
    }
  }
}

// ─── Mock Payment Provider ───
class MockPaymentProvider implements PaymentProvider {
  private orderCounter = 0;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    this.orderCounter++;
    // Simulate a small delay
    await new Promise(resolve => setTimeout(resolve, 200));

    const orderId = `order_mock_${Date.now()}_${this.orderCounter}`;

    return {
      success: true,
      orderId,
      amount: input.amount,
      currency: input.currency,
      status: 'created',
      provider: 'mock',
    };
  }

  async getOrder(orderId: string): Promise<any> {
    return {
      id: orderId,
      status: 'created',
      provider: 'mock',
    };
  }
}

// ─── Payment Gateway (Singleton) ───
// This is the SINGLE enforcement point for payment authorization.
// Even if someone bypasses the normal UI/policy call chain and directly
// reaches createOrder(), the token gate blocks unauthorized payment creation.
class PaymentGateway {
  private provider: PaymentProvider;
  private isRazorpay: boolean;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const useMock = process.env.USE_MOCK_PAYMENTS === 'true';

    if (!useMock && keyId && keySecret && keyId !== 'rzp_test_xxxxxxxxxxxxx') {
      this.provider = new RazorpayTestProvider(keyId, keySecret);
      this.isRazorpay = true;
      console.log('💳 Payment provider: Razorpay Test Mode');
    } else {
      this.provider = new MockPaymentProvider();
      this.isRazorpay = false;
      console.log('💳 Payment provider: Mock (set RAZORPAY_KEY_ID/SECRET for live test mode)');
    }
  }

  /**
   * Create a payment order.
   *
   * SECURITY INVARIANT: This method MUST NOT succeed unless the server
   * verifies a valid, single-use, transaction-bound authorization token first.
   *
   * @param input         - Payment order input (amount, currency, receipt, notes)
   * @param sessionId     - Current session ID
   * @param authTokenId   - Authorization token ID to verify and consume
   * @param transaction   - The proposed transaction (for binding verification)
   * @param intent        - The intent contract (for intentId binding verification)
   */
  async createOrder(
    input: CreateOrderInput,
    sessionId: string,
    authTokenId: string,
    transaction: ProposedTransaction,
    intent: IntentContract
  ): Promise<CreateOrderResult> {
    const startTime = Date.now();

    // ─── STEP 1: Verify authorization token ───
    const verification = verifyAuthToken(authTokenId, transaction, intent.id);

    if (!verification.valid) {
      // AUTHORIZATION FAILED — do NOT call Razorpay or Mock provider
      const failureResult: CreateOrderResult = {
        success: false,
        error: `Payment authorization failed: ${verification.reason}`,
        provider: this.isRazorpay ? 'razorpay' : 'mock',
      };

      eventLogger.log({
        sessionId,
        intentId: intent.id,
        transactionId: transaction.id,
        type: 'payment_rejected',
        severity: 'critical',
        message: `Payment REJECTED — authorization token invalid: ${verification.reason}`,
        metadata: {
          tokenId: authTokenId,
          transactionId: transaction.id,
          amount: input.amount,
          currency: input.currency,
          reason: verification.reason,
        },
        latencyMs: Date.now() - startTime,
      });

      return failureResult;
    }

    // ─── STEP 2: Consume token (single-use — must happen before payment) ───
    consumeToken(authTokenId, sessionId, transaction.id);

    // ─── STEP 3: Create payment order via underlying provider ───
    const result = await this.provider.createOrder(input);

    eventLogger.log({
      sessionId,
      intentId: intent.id,
      transactionId: transaction.id,
      type: 'payment',
      severity: result.success ? 'info' : 'high',
      message: result.success
        ? `Payment order created: ${result.orderId} (₹${result.amount} ${result.currency}) [token: ${authTokenId}]`
        : `Payment order failed: ${result.error}`,
      metadata: {
        orderId: result.orderId,
        amount: result.amount,
        currency: result.currency,
        status: result.status,
        provider: result.provider,
        success: result.success,
        authTokenId,
      },
      latencyMs: Date.now() - startTime,
    });

    return result;
  }

  getProviderInfo(): { provider: string; isLive: boolean } {
    return {
      provider: this.isRazorpay ? 'Razorpay Test Mode' : 'Mock Provider',
      isLive: this.isRazorpay,
    };
  }
}

export const paymentGateway = new PaymentGateway();
