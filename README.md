# mcp_tms_testsigma

Custom MCP server untuk integrasi **Testsigma Test Management** (`test-management.testsigma.com`) dengan Claude Code.

## Documentation

| File | Purpose |
|---|---|
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | Sprint plan, phases, timeline, risks, decisions |
| [`docs/REFERENCE.md`](./docs/REFERENCE.md) | **Single source of truth** — product facts, entity model, API spec, open questions |
| [`docs/PHASE_0_DISCOVERY.md`](./docs/PHASE_0_DISCOVERY.md) | Phase 0 playbook (archived; kept for DevTools fallback workflow) |

**Rule of consistency:** Saat ada fakta baru tentang Testsigma TMS (endpoint, field, behavior), update `docs/REFERENCE.md` dulu. Plan, code, dan tool descriptions harus refer ke sana — jangan duplikasi fakta di tempat lain.

## Status

- [x] Plan v1.0 + reference consolidated
- [x] **Phase 0 — API discovery** ✅ done via official Testsigma Postman collection. Full endpoint catalog in [`docs/REFERENCE.md` §5](./docs/REFERENCE.md#5-endpoints-reference). Phase 5 (Jira link) dropped — not in API.
- [ ] **Phase 1 — Read-only tools** 🚧 in progress (10 tools registered, awaiting first deploy + end-to-end test with real API key)
- [ ] Phase 2 — Full CRUD (TC + folders; step groups dropped)
- [ ] Phase 3 — Jira combo (orchestration only)
- [ ] Phase 4 — Test plans & runs (with multipart result marking + JUnit import)
- ~~Phase 5 — Requirements traceability~~ — **dropped** (not in API)

See [`PROJECT_PLAN.md` §4 Timeline](./PROJECT_PLAN.md) for detail.

## Local development

```bash
npm install
npm run build         # typecheck only
node --experimental-strip-types scripts/smoke.mjs   # in-memory MCP smoke test
```

Phase 1 deploys to Vercel (region `sin1`). Connect from Claude Code with a custom HTTP MCP server:

- URL: `https://<your-deployment>.vercel.app/mcp`
- Header: `X-Testsigma-Key: <your TMS API key>` (Settings → API Keys in TMS)
