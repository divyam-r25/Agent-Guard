// ─── API Client ───
// Typed API client for all backend endpoints
//
// API_BASE resolution:
//   production  → VITE_API_URL (set in Vercel dashboard)
//               trailing slash is stripped so URLs never become https://host//api/...
//   development → '/api'  (proxied to http://localhost:8000 by vite.config.ts)
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';


async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || 'API request failed');
  }
  return res.json();
}

export const api = {
  // Health
  health: () => request<any>('/health'),

  // Stats
  getStats: () => request<any>('/stats'),

  // Sessions
  createSession: () => request<any>('/session', { method: 'POST' }),

  // Intent
  compileIntent: (sessionId: string, userMessage: string) =>
    request<any>('/intent/compile', {
      method: 'POST',
      body: JSON.stringify({ sessionId, userMessage }),
    }),

  // Catalog
  searchCatalog: (query: string) =>
    request<any>('/catalog/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  // Transaction
  evaluateTransaction: (data: any) =>
    request<any>('/transaction/evaluate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  approveStepUp: (transactionId: string, sessionId: string) =>
    request<any>('/transaction/approve', {
      method: 'POST',
      body: JSON.stringify({ transactionId, sessionId }),
    }),

  // Events
  getEvents: (sessionId?: string) =>
    request<any>(`/events${sessionId ? `?sessionId=${sessionId}` : ''}`),

  // Demo
  runScenario: (scenarioId: string) =>
    request<any>('/demo/scenario', {
      method: 'POST',
      body: JSON.stringify({ scenarioId }),
    }),

  runFreeform: (userMessage: string) =>
    request<any>('/demo/freeform', {
      method: 'POST',
      body: JSON.stringify({ userMessage }),
    }),

  getScenarios: () => request<any>('/demo/scenarios'),

  resetDemo: () => request<any>('/demo/reset', { method: 'POST' }),

  // Pipeline
  getPipeline: (sessionId: string) => request<any>(`/pipeline/${sessionId}`),
};
