// ─── AgentGuard API Server ───
// Express server with all REST endpoints per PRD Section 15

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env if present.
// In production (Render), env vars are injected directly — .env will not exist.
// dotenv.config() is safe to call even when the file is absent.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });


import { paymentGateway } from './services/payment-provider';
import { eventLogger } from './services/event-logger';
import { compileIntent } from './services/intent-compiler';
import { runContextFirewall } from './services/context-firewall';
import { evaluateTransaction } from './services/policy-engine';
import { catalogSimulator } from './services/catalog-simulator';
import {
  createSession,
  getSession,
  runScenario,
  runFreeformRequest,
  handleStepUpApproval,
  resetAll,
  getAvailableScenarios,
  getPipelineResult,
  getStoredDecision,
} from './services/scenario-runner';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// ─── CORS ───
// Supports a comma-separated FRONTEND_URL list so both the Vercel preview and
// production URLs can be whitelisted without using the unsafe wildcard '*'.
// Examples:
//   single:   FRONTEND_URL=https://agentguard.vercel.app
//   multiple: FRONTEND_URL=https://agentguard.vercel.app,https://agentguard-git-main-divyam.vercel.app

// Task 1 — Normalize origins: trim whitespace, strip trailing slashes, drop empties
const normalizeOrigin = (value: string): string =>
  value.trim().replace(/\/+$/, '');

const envOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
  : [];

const allowedOrigins = Array.from(
  new Set([
    'http://localhost:5173',
    'http://localhost:3000',
    ...envOrigins,
  ])
);

// Task 3 — Safe temporary Vercel preview/deployment fallback (HTTPS only)
const VERCEL_ORIGIN_RE = /^https:\/\/[a-zA-Z0-9-]+\.vercel\.app$/;

// Task 2 & 4 — CORS callback with proper preflight handling
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no Origin header (curl, server-to-server, Render health checks)
    if (!origin) {
      return callback(null, true);
    }

    // Explicit allowlist check
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Hackathon fallback: allow any HTTPS *.vercel.app origin
    if (VERCEL_ORIGIN_RE.test(origin)) {
      return callback(null, true);
    }

    // Reject everything else with a descriptive error
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json());

// ─── Root & Health Check ───
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'AgentGuard API Server',
    description: 'Agentic Transaction Trust Layer for Razorpay',
    health: '/api/health',
    version: '1.0.0-prototype',
  });
});

app.get('/health', (_req, res) => {
  res.redirect('/api/health');
});

app.get('/api/health', (_req, res) => {
  const paymentInfo = paymentGateway.getProviderInfo();
  res.json({
    status: 'ok',
    service: 'AgentGuard API',
    version: '1.0.0-prototype',
    timestamp: new Date().toISOString(),
    payment: paymentInfo,
    llm: {
      provider: process.env.LLM_PROVIDER || 'gemini',
      model: process.env.LLM_MODEL || 'gemini-2.0-flash',
      mock: process.env.USE_MOCK_LLM === 'true' || !process.env.LLM_API_KEY,
    },
  });
});

// ─── POST /api/session ───
app.post('/api/session', (_req, res) => {
  try {
    const session = createSession();
    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/intent/compile ───
app.post('/api/intent/compile', async (req, res) => {
  try {
    const { sessionId, userMessage } = req.body;
    if (!sessionId || !userMessage) {
      return res.status(400).json({ error: 'sessionId and userMessage are required' });
    }
    const contract = await compileIntent(userMessage, sessionId);
    res.json(contract);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/catalog/search ───
app.post('/api/catalog/search', (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });
    const products = catalogSimulator.searchProducts(query);
    res.json({ products, count: products.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/catalog/sanitize ───
app.post('/api/catalog/sanitize', async (req, res) => {
  try {
    const { product, sessionId } = req.body;
    if (!product || !sessionId) {
      return res.status(400).json({ error: 'product and sessionId are required' });
    }
    const result = await runContextFirewall(product, sessionId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/transaction/evaluate ───
app.post('/api/transaction/evaluate', (req, res) => {
  try {
    const { transaction, intent, sessionId, injectionDetected } = req.body;
    if (!transaction || !intent || !sessionId) {
      return res.status(400).json({ error: 'transaction, intent, and sessionId are required' });
    }
    const decision = evaluateTransaction(transaction, intent, {
      sessionId,
      injectionDetectedInSession: injectionDetected || false,
    });
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/transaction/approve ───
app.post('/api/transaction/approve', async (req, res) => {
  try {
    const { transactionId, sessionId } = req.body;
    if (!transactionId || !sessionId) {
      return res.status(400).json({ error: 'transactionId and sessionId are required' });
    }
    const decision = await handleStepUpApproval(transactionId, sessionId);
    res.json(decision);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/events ───
app.get('/api/events', (req, res) => {
  const sessionId = req.query.sessionId as string | undefined;
  const events = eventLogger.getEvents(sessionId);
  res.json({ events, count: events.length });
});

// ─── GET /api/transactions/:id ───
app.get('/api/transactions/:id', (req, res) => {
  const decision = getStoredDecision(req.params.id);
  if (!decision) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(decision);
});

// ─── POST /api/demo/scenario ───
app.post('/api/demo/scenario', async (req, res) => {
  try {
    const { scenarioId } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required' });
    const result = await runScenario(scenarioId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /api/demo/freeform ───
app.post('/api/demo/freeform', async (req, res) => {
  try {
    const { userMessage } = req.body;
    if (!userMessage) return res.status(400).json({ error: 'userMessage is required' });
    const result = await runFreeformRequest(userMessage);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /api/demo/scenarios ───
app.get('/api/demo/scenarios', (_req, res) => {
  const scenarios = getAvailableScenarios();
  res.json({ scenarios });
});

// ─── POST /api/demo/reset ───
app.post('/api/demo/reset', (_req, res) => {
  resetAll();
  res.json({ status: 'reset', message: 'All demo state cleared' });
});

// ─── GET /api/pipeline/:sessionId ───
app.get('/api/pipeline/:sessionId', (req, res) => {
  const result = getPipelineResult(req.params.sessionId);
  if (!result) {
    return res.status(404).json({ error: 'Pipeline result not found' });
  }
  res.json(result);
});

// ─── GET /api/stats ───
app.get('/api/stats', (_req, res) => {
  const allEvents = eventLogger.getEvents();
  const decisionEvents = allEvents.filter(e => e.type === 'decision');
  res.json({
    totalSessions: new Set(allEvents.map(e => e.sessionId)).size,
    totalDecisions: decisionEvents.length,
    allowed: decisionEvents.filter(e => (e.metadata as any)?.decision === 'ALLOW').length,
    blocked: decisionEvents.filter(e => (e.metadata as any)?.decision === 'BLOCK').length,
    stepUp:  decisionEvents.filter(e => (e.metadata as any)?.decision === 'STEP_UP').length,
    injections: allEvents.filter(e => e.type === 'injection').length,
    timestamp: new Date().toISOString(),
  });
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║                                              ║
  ║        🛡️  AgentGuard API Server  🛡️         ║
  ║     Agentic Transaction Trust Layer          ║
  ║                                              ║
  ║     Port: ${PORT}                              ║
  ║     Health: http://localhost:${PORT}/api/health  ║
  ║                                              ║
  ╚══════════════════════════════════════════════╝
  `);

  // Task 5 — CORS startup diagnostics (no secrets)
  console.log(`[CORS] explicit origins: ${JSON.stringify(allowedOrigins)}`);
  console.log(`[CORS] HTTPS *.vercel.app: enabled`);
});

export default app;
