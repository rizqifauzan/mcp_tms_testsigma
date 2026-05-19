# mcp_tms_testsigma

Custom MCP server untuk integrasi **Testsigma Test Management** (`test-management.testsigma.com`) dengan Claude Code.

> Pre-implementation. Lihat planning + reference docs di bawah.

## Documentation

| File | Purpose |
|---|---|
| [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) | Sprint plan, phases, timeline, risks, decisions |
| [`docs/REFERENCE.md`](./docs/REFERENCE.md) | **Single source of truth** — product facts, entity model, API spec, open questions |

**Rule of consistency:** Saat ada fakta baru tentang Testsigma TMS (endpoint, field, behavior), update `docs/REFERENCE.md` dulu. Plan, code, dan tool descriptions harus refer ke sana — jangan duplikasi fakta di tempat lain.

## Status

- [x] Plan v1.0 + reference consolidated
- [ ] Phase 0 — API discovery (blocker for coding)
- [ ] Phase 1 — Read-only tools
- [ ] Phase 2 — Full CRUD
- [ ] Phase 3 — Jira combo
- [ ] Phase 4 — Test plans & runs
- [ ] Phase 5 — Requirements traceability

See [`PROJECT_PLAN.md` §4 Timeline](./PROJECT_PLAN.md) for detail.
