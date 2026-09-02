# Contributing to AgentGuard

Thank you for your interest in AgentGuard! This is a hackathon prototype built for the Razorpay AI Buildathon 2026.

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
npm install
cp .env.example .env
# Edit .env with your API keys (all optional — fallbacks are built-in)
npm run dev
```

This starts:
- API server at `http://localhost:8000`
- Frontend at `http://localhost:5173`

## Project Structure

```
apps/api/src/
  services/         Core AgentGuard services
  config/           Heuristic patterns + policy weights
  types/            Shared TypeScript interfaces

apps/web/src/
  components/       React UI components
  hooks/            State management hooks
  lib/              API client

fixtures/           Demo scenarios + product catalog JSON
scripts/            Utility scripts
```

## Making Changes

### Adding a new attack scenario

1. Add a fixture entry to `fixtures/demo-scenarios.json`
2. Add the scenario button to `apps/web/src/components/AttackLab.tsx`
3. If you need a new product with a malicious payload, add it to `fixtures/attack-cases.json` and `fixtures/products.json`

### Adding a new heuristic pattern

Edit `apps/api/src/config/heuristics.ts` — add a new entry to the `INJECTION_PATTERNS` array with:
- `id`: unique string ID
- `description`: human-readable description
- `pattern`: RegExp
- `severity`: `'low' | 'medium' | 'high' | 'critical'`
- `attackType`: one of the defined attack types

### Modifying risk weights

Edit `apps/api/src/config/policy.ts`. All scoring weights are defined there and documented with comments.

## Code Style

- TypeScript strict mode is enabled
- All types are defined in `apps/api/src/types/index.ts`
- All services export functions, not classes (where possible)
- Every security decision must produce a `SecurityEvent` via `eventLogger`

## Security Rules (non-negotiable)

- **The Policy Engine is the sole authority** on ALLOW/STEP-UP/BLOCK
- **LLM output is advisory only** — the LLM classifier cannot override hard rules
- **No Razorpay call may bypass the Policy Engine** — all payment creation goes through `paymentGateway` which is gated by the scenario runner
- **BLOCK decisions must not call the payment provider**

## License

MIT — see [LICENSE](LICENSE)
