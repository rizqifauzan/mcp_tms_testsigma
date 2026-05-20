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
- [x] **Phase 1 — Read-only tools** ✅ 10 tools, deployed to Vercel, end-to-end verified from Claude Code (2026-05-19)
- [x] **Phase 2 — Write tools** ✅ 8 tools (TC CRUD + bulk update + folder CRUD with move), E2E net-zero verified (2026-05-19)
- [ ] Phase 3 — Jira combo (orchestration only) — *optional, skipped if no Jira*
- [x] **Phase 4 — Test plans & runs** ✅ 7 tools (plan CRUD + run create/mark/close/delete with STATIC+DYNAMIC selection + multipart result marking), E2E net-zero verified (2026-05-20). JUnit import deferred — out of MVP scope.
- ~~Phase 5 — Requirements traceability~~ — **dropped** (not in API)

See [`PROJECT_PLAN.md` §4 Timeline](./PROJECT_PLAN.md) for detail.

## Local development

```bash
npm install
npm run build      # typecheck only
npm run smoke      # in-memory MCP smoke test (no network)
npm run e2e        # full end-to-end against real TMS API (needs TMS_API_KEY in .env)
```

Phase 1 deploys to Vercel (region `sin1`). Connect from Claude Code with a custom HTTP MCP server:

- URL: `https://<your-deployment>.vercel.app/mcp`
- Header: `X-Testsigma-Key: <your TMS API key>` (Settings → API Keys in TMS)
