// ─── Catalog Simulator ───
// Mimics a merchant integration/MCP tool source per PRD Section 9
// Provides search_products, get_product, get_cart

import * as fs from 'fs';
import * as path from 'path';
import { Product, MaliciousPayload } from '../types';

interface ProductFixtures {
  products: Product[];
  maliciousProducts: Array<{
    id: string;
    name: string;
    legitimateDescription: string;
    maliciousPayloads: MaliciousPayload[];
    price: number;
    currency: string;
    merchantId: string;
    merchantName: string;
    stock: number;
    category: string;
    shipping: { estimatedDays: number };
  }>;
}

class CatalogSimulator {
  private products: Product[] = [];
  private maliciousPayloads: Map<string, MaliciousPayload[]> = new Map();
  private legitimateDescriptions: Map<string, string> = new Map();

  constructor() {
    this.loadFixtures();
  }

  private loadFixtures(): void {
    const fixturesPath = path.resolve(__dirname, '../../../../fixtures/products.json');
    const data: ProductFixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
    
    this.products = data.products;

    // Build malicious products as regular products with injected descriptions
    for (const mal of data.maliciousProducts) {
      this.legitimateDescriptions.set(mal.id, mal.legitimateDescription);
      this.maliciousPayloads.set(mal.id, mal.maliciousPayloads);

      // Add as a regular product with legitimate description
      this.products.push({
        id: mal.id,
        name: mal.name,
        description: mal.legitimateDescription,
        price: mal.price,
        currency: mal.currency,
        merchantId: mal.merchantId,
        merchantName: mal.merchantName,
        stock: mal.stock,
        category: mal.category,
        shipping: mal.shipping,
      });
    }
  }

  searchProducts(query: string): Product[] {
    const q = query.toLowerCase();
    return this.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  getProduct(productId: string): Product | undefined {
    return this.products.find(p => p.id === productId);
  }

  /**
   * Get a product with a malicious payload injected into the description.
   * Used for demo scenarios to simulate prompt injection attacks.
   */
  getProductWithInjection(productId: string, payloadId: string): Product | undefined {
    const product = this.getProduct(productId);
    if (!product) return undefined;

    const payloads = this.maliciousPayloads.get(productId);
    if (!payloads) return product;

    const payload = payloads.find(p => p.id === payloadId);
    if (!payload) return product;

    return {
      ...product,
      description: `${product.description}\n\n${payload.payload}`,
    };
  }

  getMaliciousPayloads(productId: string): MaliciousPayload[] {
    return this.maliciousPayloads.get(productId) || [];
  }

  getLegitimateDescription(productId: string): string | undefined {
    return this.legitimateDescriptions.get(productId);
  }

  getAllProducts(): Product[] {
    return [...this.products];
  }

  getProductsByCategory(category: string): Product[] {
    return this.products.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  reset(): void {
    this.products = [];
    this.maliciousPayloads.clear();
    this.legitimateDescriptions.clear();
    this.loadFixtures();
  }
}

export const catalogSimulator = new CatalogSimulator();
