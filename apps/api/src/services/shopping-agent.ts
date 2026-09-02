// ─── Shopping Agent ───
// LLM-based shopping agent with tool calling + deterministic fallback
// Per PRD Section 8.1

import { v4 as uuidv4 } from 'uuid';
import { Product, ProposedTransaction, AgentState, AgentAction } from '../types';
import { catalogSimulator } from './catalog-simulator';
import { eventLogger } from './event-logger';

// ─── Demo Agent (Deterministic Fallback) ───
// Used when no LLM API key is available
class DemoShoppingAgent {
  async searchAndPropose(
    query: string,
    sessionId: string,
    intentId: string,
    options?: { selectedProductId?: string; overrideTransaction?: Partial<ProposedTransaction> }
  ): Promise<{ state: AgentState; product: Product | undefined }> {
    const actions: AgentAction[] = [];
    const now = () => new Date().toISOString();

    // Step 1: Search
    actions.push({
      type: 'search',
      description: `Searching catalog for: "${query}"`,
      timestamp: now(),
    });

    const results = catalogSimulator.searchProducts(query);

    actions.push({
      type: 'tool_call',
      description: `Found ${results.length} products matching query`,
      data: { resultCount: results.length, productIds: results.map(p => p.id) },
      timestamp: now(),
    });

    // Step 2: Select product
    let selectedProduct: Product | undefined;

    if (options?.selectedProductId) {
      selectedProduct = catalogSimulator.getProduct(options.selectedProductId);
    } else if (results.length > 0) {
      // Pick the best match (first result)
      selectedProduct = results[0];
    }

    if (!selectedProduct) {
      return {
        state: {
          sessionId,
          status: 'completed',
          actions: [...actions, {
            type: 'select',
            description: 'No suitable products found',
            timestamp: now(),
          }],
        },
        product: undefined,
      };
    }

    actions.push({
      type: 'select',
      description: `Selected: ${selectedProduct.name} (₹${selectedProduct.price}) from ${selectedProduct.merchantName}`,
      data: { productId: selectedProduct.id },
      timestamp: now(),
    });

    // Step 3: Propose transaction
    const transaction: ProposedTransaction = {
      id: `txn_${uuidv4().slice(0, 8)}`,
      intentId,
      merchantId: selectedProduct.merchantId,
      merchantName: selectedProduct.merchantName,
      productIds: [selectedProduct.id],
      productNames: [selectedProduct.name],
      amount: selectedProduct.price,
      currency: selectedProduct.currency,
      quantity: 1,
      shippingAddressId: 'addr_default',
      agentId: 'demo-shopping-agent',
      sessionId,
      category: selectedProduct.category,
      // Apply any overrides (for demo attack scenarios)
      ...options?.overrideTransaction,
    };

    actions.push({
      type: 'propose',
      description: `Proposing transaction: ₹${transaction.amount} for ${transaction.quantity}x ${selectedProduct.name}`,
      data: { transaction },
      timestamp: now(),
    });

    return {
      state: {
        sessionId,
        status: 'awaiting_decision',
        actions,
        selectedProduct,
        proposedTransaction: transaction,
      },
      product: selectedProduct,
    };
  }
}

// ─── LLM Shopping Agent ───
class LLMShoppingAgent {
  async searchAndPropose(
    query: string,
    sessionId: string,
    intentId: string,
    options?: { selectedProductId?: string; overrideTransaction?: Partial<ProposedTransaction> }
  ): Promise<{ state: AgentState; product: Product | undefined }> {
    const apiKey = process.env.LLM_API_KEY;

    if (!apiKey || process.env.USE_MOCK_LLM === 'true') {
      // Fallback to demo agent
      const demo = new DemoShoppingAgent();
      return demo.searchAndPropose(query, sessionId, intentId, options);
    }

    const actions: AgentAction[] = [];
    const now = () => new Date().toISOString();

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      // Search catalog
      const products = catalogSimulator.searchProducts(query);
      actions.push({
        type: 'search',
        description: `Searched catalog for: "${query}" — found ${products.length} results`,
        data: { resultCount: products.length },
        timestamp: now(),
      });

      if (products.length === 0) {
        return {
          state: { sessionId, status: 'completed', actions },
          product: undefined,
        };
      }

      // Use LLM to select best product
      const prompt = `You are a shopping assistant. The user wants: "${query}"

Available products:
${products.map(p => `- ${p.id}: ${p.name} — ₹${p.price} from ${p.merchantName} (${p.category})`).join('\n')}

Select the single best matching product. Respond with ONLY valid JSON:
{
  "selected_product_id": "prod_xxx",
  "reason": "brief reason for selection"
}`;

      const response = await ai.models.generateContent({
        model: process.env.LLM_MODEL || 'gemini-2.0-flash',
        contents: prompt,
      });

      const text = response.text?.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let selectedId = products[0].id;

      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.selected_product_id) {
            selectedId = parsed.selected_product_id;
          }
        } catch { /* use default */ }
      }

      // Override with explicit selection if provided
      if (options?.selectedProductId) {
        selectedId = options.selectedProductId;
      }

      const selectedProduct = catalogSimulator.getProduct(selectedId) || products[0];

      actions.push({
        type: 'select',
        description: `Selected: ${selectedProduct.name} (₹${selectedProduct.price}) from ${selectedProduct.merchantName}`,
        data: { productId: selectedProduct.id },
        timestamp: now(),
      });

      // Build transaction
      const transaction: ProposedTransaction = {
        id: `txn_${uuidv4().slice(0, 8)}`,
        intentId,
        merchantId: selectedProduct.merchantId,
        merchantName: selectedProduct.merchantName,
        productIds: [selectedProduct.id],
        productNames: [selectedProduct.name],
        amount: selectedProduct.price,
        currency: selectedProduct.currency,
        quantity: 1,
        shippingAddressId: 'addr_default',
        agentId: 'llm-shopping-agent',
        sessionId,
        category: selectedProduct.category,
        ...options?.overrideTransaction,
      };

      actions.push({
        type: 'propose',
        description: `Proposing: ₹${transaction.amount} for ${transaction.quantity}x ${selectedProduct.name}`,
        data: { transaction },
        timestamp: now(),
      });

      return {
        state: {
          sessionId,
          status: 'awaiting_decision',
          actions,
          selectedProduct,
          proposedTransaction: transaction,
        },
        product: selectedProduct,
      };
    } catch (error) {
      console.error('LLM agent error, falling back to demo agent:', error);
      const demo = new DemoShoppingAgent();
      return demo.searchAndPropose(query, sessionId, intentId, options);
    }
  }
}

// ─── Export ───
export function createShoppingAgent(): LLMShoppingAgent {
  return new LLMShoppingAgent();
}

export { DemoShoppingAgent, LLMShoppingAgent };
