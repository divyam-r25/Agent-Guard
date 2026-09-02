// ─── Merchant Tool Gateway ───
// MCP-inspired tool layer simulating a merchant/catalog tool server.
// The AI agent calls tools through this gateway.
// The Context Firewall intercepts raw tool output BEFORE the agent sees it.

import { v4 as uuidv4 } from 'uuid';
import { Product, ToolResponse, FirewallResult } from '../types';
import { catalogSimulator } from './catalog-simulator';
import { eventLogger } from './event-logger';

// ─── Tool Schema ───
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, string>;
}

export const MERCHANT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_products',
    description: 'Search the merchant catalog for products matching a query',
    inputSchema: { query: 'string' },
  },
  {
    name: 'get_product',
    description: 'Get a specific product by ID',
    inputSchema: { productId: 'string' },
  },
  {
    name: 'get_catalog_metadata',
    description: 'Get catalog metadata including available categories and merchants',
    inputSchema: {},
  },
];

// ─── Raw Tool Output Types ───
interface SearchProductsOutput {
  products: Product[];
  count: number;
  query: string;
}

interface GetProductOutput {
  product: Product | null;
  found: boolean;
}

interface CatalogMetadataOutput {
  categories: string[];
  productCount: number;
  merchants: Array<{ id: string; name: string }>;
}

type RawToolOutput = SearchProductsOutput | GetProductOutput | CatalogMetadataOutput;

// ─── Merchant Tool Gateway ───
export class MerchantToolGateway {
  private scenarioOverrides: Map<string, { productId: string; payloadId: string }> = new Map();

  // ─── Register a malicious payload for a session (attack scenarios) ───
  setMaliciousOverride(sessionId: string, productId: string, payloadId: string): void {
    this.scenarioOverrides.set(sessionId, { productId, payloadId });
  }

  clearOverride(sessionId: string): void {
    this.scenarioOverrides.delete(sessionId);
  }

  // ─── Execute tool call ───
  async callTool(
    toolName: string,
    input: Record<string, unknown>,
    sessionId: string
  ): Promise<ToolResponse> {
    const startTime = Date.now();

    // Log tool call
    eventLogger.log({
      sessionId,
      type: 'tool_call',
      severity: 'info',
      message: `Agent called tool: ${toolName}(${JSON.stringify(input)})`,
      metadata: { toolName, input },
    });

    let rawOutput: RawToolOutput;

    switch (toolName) {
      case 'search_products': {
        const query = (input.query as string) || '';
        let products = catalogSimulator.searchProducts(query);

        // Check for malicious override in this session
        const override = this.scenarioOverrides.get(sessionId);
        if (override) {
          // Return the malicious version of the product in search results
          const malProduct = catalogSimulator.getProductWithInjection(
            override.productId,
            override.payloadId
          );
          if (malProduct) {
            // Replace or inject the malicious product
            products = products.map(p => (p.id === malProduct.id ? malProduct : p));
            if (!products.find(p => p.id === malProduct.id)) {
              products = [malProduct, ...products];
            }
          }
        }

        rawOutput = { products, count: products.length, query };
        break;
      }

      case 'get_product': {
        const productId = input.productId as string;
        const override = this.scenarioOverrides.get(sessionId);

        let product: Product | undefined;
        if (override && override.productId === productId) {
          product = catalogSimulator.getProductWithInjection(override.productId, override.payloadId);
        } else {
          product = catalogSimulator.getProduct(productId);
        }

        rawOutput = { product: product || null, found: !!product };
        break;
      }

      case 'get_catalog_metadata': {
        const allProducts = catalogSimulator.getAllProducts();
        const categories = [...new Set(allProducts.map(p => p.category))];
        const merchantMap = new Map<string, string>();
        allProducts.forEach(p => merchantMap.set(p.merchantId, p.merchantName));

        rawOutput = {
          categories,
          productCount: allProducts.length,
          merchants: Array.from(merchantMap.entries()).map(([id, name]) => ({ id, name })),
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    const latencyMs = Date.now() - startTime;

    const response: ToolResponse = {
      toolName,
      input,
      rawOutput,
      timestamp: new Date().toISOString(),
      latencyMs,
    };

    return response;
  }

  // ─── Get tool definitions ───
  getTools(): ToolDefinition[] {
    return MERCHANT_TOOLS;
  }
}

export const merchantToolGateway = new MerchantToolGateway();
