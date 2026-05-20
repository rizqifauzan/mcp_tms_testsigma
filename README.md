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

## Connecting

The server supports two auth flows. Pick the one that matches your client.

### Claude Code (CLI) — header

Claude Code supports custom HTTP headers, which is the more secure option.

```bash
claude mcp add tms --transport http \
  --url https://<your-deployment>.vercel.app/mcp \
  --header "X-Testsigma-Key: <YOUR_TMS_API_KEY>"
```

### Claude Web (claude.ai) — URL path

Claude Web's connector UI doesn't expose custom headers, so the key goes in the URL path:

```
https://<your-deployment>.vercel.app/mcp/<YOUR_TMS_API_KEY>
```

⚠️ The URL itself becomes a credential — anyone who sees it can use your TMS key. Treat it like a password.

## For team members (Team Cata)

Each member uses **their own** TMS API key, not a shared one. This preserves audit trail, per-user permissions, and clean offboarding (revoke one key without affecting others).

**Setup steps for each QA:**

1. Log in to https://test-management.testsigma.com
2. Settings → API Keys → **Generate New Key**
3. Name it `Personal MCP - <your name>` so it's traceable
4. Copy the key (long JWT starting with `eyJ...`)
5. Add the connector:
   - **Claude Code**: see CLI snippet above with your key in the header
   - **Claude Web**: paste `https://<deployment>.vercel.app/mcp/<your_key>` into the custom connector URL field

**Security rules:**
- ❌ Don't commit the URL to git
- ❌ Don't paste the URL into public Slack channels or shared docs
- ❌ Don't screenshot the URL
- ❌ Don't share your key with teammates — each person uses their own
- ✅ If the URL leaks: revoke the key in TMS (Settings → API Keys → Revoke), generate a new one, update your connector
- ✅ Before resigning: revoke your own key so it's clean

**Offboarding checklist:**
- [ ] User revokes their personal TMS API key (or admin does it on their behalf)
- [ ] Remove their access from any shared Vercel/GitHub resources
