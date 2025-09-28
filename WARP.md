# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Runtime: Node.js 20.x, Express.js, MongoDB (Mongoose)
- Domains: authentication, crops, payments (Stripe + crypto), blockchain (ethers), price oracle aggregation (Chainlink/CoinGecko/CMC), AI utilities (@google/generative-ai)
- Realtime: Socket.IO initialized at server start and attached to requests (req.io)
- Security: helmet CSP, CORS, rate limiting, centralized error handling
- Scheduling: cron job updates price oracle every 15 minutes (non-test env)

Common commands (PowerShell on Windows)
- Install dependencies (clean, CI-friendly):
```bash path=null start=null
npm ci
```

- Start in development (auto-reload):
```bash path=null start=null
npm run dev
```

- Start in production (aligns with user rules: NODE_ENV=production, npm start):
```bash path=null start=null
$env:NODE_ENV = "production"; npm start
```

- Run all tests (Jest):
```bash path=null start=null
npm test
```

- Run a single test file:
```bash path=null start=null
npx jest path\to\file.test.js
```

- Run tests matching a name/pattern:
```bash path=null start=null
npx jest -t "pattern"
```

- Watch mode during development:
```bash path=null start=null
npx jest --watch
```

- Deploy/verify smart contracts with Hardhat (scripts provided in package.json):
```bash path=null start=null
npm run deploy
npm run verify
```

Environment setup
- Copy the example environment file and fill in required values:
```bash path=null start=null
Copy-Item env.example .env
```

- Minimum to boot the API locally (from code usage across server and services):
  - MONGODB_URI
  - JWT_SECRET
  - Optional/feature flags: CORS_ORIGIN, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX, STRIPE_KEY_SECRET, STRIPE_WEBHOOK_SECRET, POLYGON_RPC_URL, PRIVATE_KEY, COINMARKETCAP_API_KEY, COINGECKO_API_KEY

High-level architecture and flow
- Entry point: server.js
  - Initializes Express, security middleware (helmet with CSP, CORS), rate limiting, body parsing
  - Creates HTTP server and initializes Socket.IO via src/services/socketService (exposes io and attaches to req)
  - Connects to MongoDB with retry and fast-fail for missing env vars
  - Registers routes under /api/*: auth, payment, price-oracle, ai, blockchain, crop
  - Health endpoints (/health with detailed status, /contracts for current on-chain addresses)
  - Global error handler and 404 handler
  - Schedules periodic price updates with node-cron (every 15 minutes)

- Routing and layering
  - Routes (src/routes/*.js) validate inputs (express-validator), enforce auth/roles (src/middleware/auth), and delegate to controllers/services
  - Controllers (e.g., src/controllers/cropController.js) orchestrate request handling and use services (e.g., IPFS uploads) and models
  - Services encapsulate domain logic and external integrations:
    - paymentService: Stripe integration, hybrid fiat/crypto flow, webhooks, persistence
    - priceOracleService: aggregation across Chainlink/CoinGecko/CMC, caching, volatility/stats
    - blockchainService and config/blockchain: ethers providers/signers, contract access via artifacts, helpers to parse/format units
    - aiService: crop narratives/analysis using @google/generative-ai
    - socketService: Socket.IO initialization/broadcast helpers
    - ipfsService: asset uploads used by crop workflows
  - Models (src/models/*.js) are Mongoose schemas for users, crops, payments, refunds, notifications, webhooks, etc. Example: src/models/User.js includes auth helpers (JWT, bcrypt), account lockout, indexes, geo fields

- Configuration and utilities
  - src/config/database.js centralizes Mongoose connection options
  - src/config/oracle.js defines price sources, caching, and fetchers; also exposes exchange-rate helpers
  - src/config/blockchain.js reads ABIs from artifacts and resolves contracts by env-based addresses
  - src/utils/logger.js wraps winston for structured logging to console and rotating files
  - src/utils/response.js standardizes success/error payloads

Development tips specific to this repo
- Node version is pinned to 20.x in package.json engines; ensure local Node matches to avoid dependency/tooling issues
- Realtime features rely on the HTTP server created in server.js; integrate additional realtime use cases through socketService rather than creating separate Socket.IO instances
- Price oracle and payments touch external services; when running tests for these areas, prefer stubbing HTTP/SDK calls

Notes on lint/build
- No linter or formatter is configured in the repo at the time of writing (no ESLint/Prettier files detected)
- This codebase is plain JavaScript (no TypeScript config or build step). There is no compile/build step required before start
