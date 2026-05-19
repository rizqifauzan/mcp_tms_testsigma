# Testsigma MCP Server — Project Plan

**Owner:** Rizqi
**Goal:** Build custom MCP server untuk integrasi **Testsigma Test Management (TMS standalone)** — `test-management.testsigma.com` — dengan Claude Code, distributable ke QA team.
**Start Date:** May 2026
**Target MVP:** 1-2 hari kerja

> ⚠️ **Product clarification:** Target adalah **Testsigma Test Management** (TMS — `test-management.testsigma.com`), BUKAN Testsigma automation platform (`app.testsigma.com`). Keduanya produk berbeda dengan API berbeda. TMS fokus ke test case management, folder hierarchy, test plans, requirements traceability — tidak ada NLP test step grammar.
>
> 📚 **Single source of truth:** semua fakta produk, entity model, field schema, endpoint, dan limitations didokumentasikan di [`docs/REFERENCE.md`](./docs/REFERENCE.md). Plan ini point ke sana untuk detail teknis — JANGAN duplikasi info di dua file. Update reference dulu, baru update plan kalau scope berubah.

---

## 1. Vision & Objectives

### Primary Goal
Enable QA Engineers di squad GROW untuk berinteraksi dengan Testsigma (Cloud) melalui natural language di Claude Code, mengurangi context-switching dan manual entry.

### Success Criteria
- ✅ Bisa list/read test case via prompt natural language
- ✅ Bisa create/update/delete test case skeleton tanpa buka Testsigma UI
- ✅ Combo dengan Atlassian MCP untuk scaffolding test case dari Jira ticket
- ✅ Bisa di-share ke QA team dengan onboarding < 10 menit per orang
- ✅ Zero monthly hosting cost (Vercel free tier)

### Non-Goals (Out of Scope MVP)
- ❌ Auto-record UI test steps (butuh browser recorder — domain automation platform, bukan TMS)
- ❌ Trigger automation runs (TMS bukan execution engine)
- ❌ UI element locator generation
- ❌ Replicate TMS native AI agents (Generator/Sprint Planner/Bug Reporter — already exist di TMS UI, lihat [REFERENCE §6](./docs/REFERENCE.md#6-native-integrations-relevant-ke-mcp))
- ❌ Step attachment upload (defer; tool tanpa attachment di MVP)

---

## 2. Stack & Architecture

### Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Runtime | Vercel Functions (Node.js) | Familiar dari TERSIRAT, free tier cukup |
| Language | TypeScript | Type safety, ekosistem MCP matang |
| MCP SDK | `@modelcontextprotocol/sdk` + `@vercel/mcp-adapter` | Official, optimized untuk Vercel |
| Transport | Streamable HTTP | Modern MCP spec, compatible dengan Claude Web |
| Validation | Zod | Industry standard untuk schema validation |
| Auth | Per-user API key via HTTP header | Audit trail, no shared credential |
| Domain | `*.vercel.app` subdomain | Free, upgrade ke custom domain later |

### Architecture Diagram

```
┌─────────────────────────────────┐
│  Claude Code (Mac/Win/Web)      │
│  - Connect via MCP config       │
│  - Send X-Testsigma-Key header  │
└────────────┬────────────────────┘
             │ HTTPS
             ▼
┌─────────────────────────────────┐
│  Vercel Function                │
│  testsigma-mcp.vercel.app       │
│  - MCP protocol handler         │
│  - Tool registry                │
│  - Testsigma API client wrapper │
└────────────┬────────────────────┘
             │ HTTPS + Bearer
             ▼
┌─────────────────────────────────┐
│  Testsigma Test Management API  │
│  test-management.testsigma.com  │
│  (base path TBD — discovery)    │
└─────────────────────────────────┘
```

> 📌 **API base URL & endpoint paths perlu di-discover dulu** via Network tab di TMS UI. Public Swagger/OpenAPI belum ketemu di docs. Tambah **Phase 0 — API Discovery** sebelum coding.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Stateless server | No DB, no session — API key per request |
| Per-user auth | Audit log Testsigma tetap berfungsi, security better |
| Vercel Functions (bukan Edge) | MCP SDK butuh Node.js APIs full |
| Streamable HTTP transport | Support semua Claude Code platform (Mac/Win/Web) |
| TypeScript strict mode | Catch error di compile time, bukan runtime |
| Monorepo structure | Tools terorganisir per domain (projects, testcases, etc) |

---

## 3. Scope Breakdown

### Phase 0 — API Discovery ✅ DONE (2026-05-19)
**Goal:** Resolve all blockers for coding. Endpoint catalog, auth, schemas.

**Outcome:** Found the official Testsigma Postman collection (https://documenter.getpostman.com/view/40565679/2sB2xChp9y) and ingested all 44 documented endpoints into [REFERENCE §5](./docs/REFERENCE.md#5-endpoints-reference). Combined with authenticated probe data, this closes every blocker.

**What's confirmed:**
- ✅ Base URL, auth (`Authorization: Bearer <api_key>` from TMS Settings → API Keys panel)
- ✅ Full CRUD for: Project, Folder, Test Case, Step Group, Test Run, Test Plan
- ✅ Lookup endpoints (root-level, not project-nested): `/test_cases/{statuses,priorities,types,automation_types}`, `/test_runs/statuses`
- ✅ TC has TWO templates: `TCD` (text blob) and `STEPS` (structured `individual_steps[]`)
- ✅ Step Groups are a new first-class entity (reusable step bundles)
- ✅ Run results via multipart/form-data PUT; JUnit XML import endpoint
- ✅ Cursor pagination + `__operator` filter syntax

**What's dropped (negative findings):**
- ❌ Test Suites — not in API. Use run `selection_type: STATIC` with `static_selection_filters` instead.
- ❌ Requirements / Jira link — not in API. Phase 5 dropped from plan (see below).
- ❌ Custom Fields, TC Attachments, Comments, History — not in API.

**Minor open items (don't block Phase 1):** rate limit window unit, `label_ids` vs `label_names` semantics, full `step_type` enum values. Tracked in [REFERENCE §8](./docs/REFERENCE.md#8-known-limitations--open-questions).

### Phase 1 — Read-Only Tools (Confidence: 🟢 High)
**Goal:** User bisa browse TMS data dari Claude tanpa buka UI.

> Endpoint paths placeholder — finalisasi & sync dengan [REFERENCE §5](./docs/REFERENCE.md#5-endpoints-reference) setelah Phase 0. Entity model lihat [REFERENCE §2](./docs/REFERENCE.md#2-entity-model--hierarchy).

| Tool | Resource (lihat REFERENCE §5) | Use Case |
|------|----------|----------|
| `list_projects` | Projects | "Show me my Testsigma TMS projects" |
| `get_project` | Projects | "Detail project GROW" |
| `list_folders` | Folders | "Show folder tree GROW" |
| `list_test_cases` | Test Cases | "List test case di folder Voucher" (filter `?folder_id=`, `?search=`) |
| `get_test_case` | Test Cases | "Show detail GR-7 with steps" (URL accepts human_id) |
| `list_test_plans` | Test Plans | "What test plans di GROW?" |
| `get_test_plan` | Test Plans | "Detail Regression Plan" |
| `list_test_runs` | Test Runs | "Show active test runs" |
| `get_test_run` | Test Runs | "Status of GR-R-1" |
| `list_step_groups` | Step Groups | "What reusable step groups exist?" |
| `list_label_options` | Settings | Resolve status/priority/type names from UUID |

**Estimated effort:** 2-3 jam
**Risk:** Low (read-only, no destructive ops)

### Phase 2 — Full Test Case CRUD (Confidence: 🟢 High)
**Goal:** Create/update/delete TC including steps. Both template types (TCD and STEPS) supported.

| Tool | Resource | Behavior |
|------|----------|----------|
| `create_test_case` | Test Cases | Body shape per [REFERENCE §5 Test Cases](./docs/REFERENCE.md#test-cases). Tool resolves status/priority/type names → UUIDs via Settings lookups (cached per session). Accept either `template_type: "TCD"` (steps as text) or `"STEPS"` (with `individual_steps[]`). |
| `update_test_case` | Test Cases | Patch any field. Supports template switching. |
| `delete_test_case` | Test Cases | Delete with confirmation prompt |
| `create_folder` | Folders | Body: `{name, order}`. Parent set via `move_folder` |
| `update_folder` / `delete_folder` / `move_folder` | Folders | CRUD + reparent via `POST /folders/{id}/move` |
| `add_step` / `update_step` / `delete_step` | Test Cases | **Only when TC is `template_type: STEPS`.** Granular ops via read-modify-write on `individual_steps[]` with stale-read guard (compare `updated_at`). For `TCD` templates these tools return a clear error pointing user to `update_test_case`. |
| `create_step_group` / `update_step_group` / `delete_step_group` | Step Groups | Reusable bundles. Stretch goal — drop if not used by GROW squad. |

**Estimated effort:** 3-4 jam
**Risk:** Medium (write ops, butuh validation + idempotency)

**Safety Measures:**
- Confirmation prompt untuk DELETE
- Dry-run mode untuk bulk operations
- Return preview sebelum execute

### Phase 3 — Jira Integration Combo (Confidence: 🟢 High)
**Goal:** Scaffolding test case dari Jira ticket via combo MCP.

**No new tools needed** — leverage existing tools di Phase 1+2, kombinasikan dengan Atlassian MCP yang sudah connected.

**Example flow:**
```
User prompt → Claude orchestrator
  → Atlassian:searchJiraIssuesUsingJql
  → Testsigma:create_test_case (loop)
  → Atlassian:addCommentToJiraIssue (optional backlink)
  → Format summary table
```

**Estimated effort:** 1 jam (testing + prompt engineering)
**Risk:** Low (just orchestration)

### Phase 4 — Test Plans & Runs (Confidence: 🟢 High — revised after Phase 0)
**Goal:** Manage test plans dan record manual run results. No suite layer (suites don't exist in API; runs select TCs directly via `static_selection_filters`).

| Tool | Resource | Notes |
|------|----------|-------|
| `create_test_plan` | Test Plans | Body: `{title, description, start_date, end_date, label_ids}` |
| `complete_test_plan` | Test Plans | `POST /test_plans/{id}/complete` |
| `list_runs_for_plan` | Test Plans | `GET /test_plans/{id}/test_runs` |
| `start_test_run` | Test Runs | `selection_type` STATIC (explicit TC list) or DYNAMIC (filter at runtime) |
| `assign_user_to_run_tc` | Test Runs | `PUT /test_runs/{id}/assign_user` |
| `update_run_result` | Test Runs | Multipart PUT to `/test_runs/{id}/test_cases`. Mark Pass/Fail/Blocked/Skip + optional description + attachments |
| `get_run_summary` | Test Runs | Aggregate from `test_run_status_summary` field on run detail |
| `import_junit_results` | Test Runs | Optional stretch — `POST /junit-import/test-run/{run_id}` |

**Estimated effort:** 3-4 jam
**Risk:** Low-Medium (multipart formatting + status resolution from `/test_runs/statuses` lookup)

### ~~Phase 5 — Requirements & Jira Traceability~~ — **DROPPED**
**Rationale:** Phase 0 confirmed Testsigma's REST API does not expose the Requirements/Jira-link surface. The two-way sync is UI-only / handled by the Atlassian Marketplace add-on, not by REST endpoints we can call.

**Alternative:** Phase 3 (Jira combo) already covers the realistic value — Claude can read Jira context and scaffold TCs. Users still link manually in the TMS UI when needed.

---

## 4. Timeline

### MVP Sprint (Phase 0-3) — Target: 2 hari

| Day | Time | Activity |
|-----|------|----------|
| ~~Day 1 AM~~ | ~~2-3 jam~~ | ~~Phase 0~~ — ✅ **DONE** via Postman doc ingestion |
| Day 1 AM | 1 jam | Setup repo, Vercel project, deps, TypeScript config |
| Day 1 AM | 1 jam | MCP transport skeleton + handshake test |
| Day 1 PM | 2-3 jam | Phase 1: Read-only tools (~11 tools incl. Settings lookups) |
| Day 1 PM | 1 jam | Local testing dengan Claude Code |
| Day 2 AM | 3-4 jam | Phase 2: Full CRUD (TC, folders, optionally step groups) |
| Day 2 AM | 30 min | Deploy ke Vercel production |
| Day 2 PM | 1 jam | Phase 3: Test combo dengan Atlassian MCP |
| Day 2 PM | 1.5 jam | README, onboarding doc, error polishing |
| **Total** | **~10-11 jam** | **MVP shipped** |

### Follow-up (Phase 4) — Target: 2-3 hari setelah MVP

| Week | Activity |
|------|----------|
| Week 2, Day 1-2 | Phase 4: Plans + Runs + result marking (multipart) |
| Week 2, Day 3 | Integration testing + documentation update |
| Week 2, Day 4 | Soft launch ke 1-2 QA colleagues untuk feedback |

---

## 5. Repository Structure

```
testsigma-mcp/
├── api/
│   └── mcp.ts                   # Vercel function entry point
├── src/
│   ├── server.ts                # MCP server setup
│   ├── client/
│   │   └── testsigma.ts         # Testsigma API client wrapper
│   ├── tools/
│   │   ├── index.ts             # Tool registry
│   │   ├── projects.ts          # Project tools
│   │   ├── testcases.ts         # Test case tools
│   │   ├── testsuites.ts        # Test suite tools
│   │   └── search.ts            # Search/filter tools
│   ├── schemas/
│   │   ├── testsigma.ts         # Zod schemas untuk API response
│   │   └── tool-inputs.ts       # Zod schemas untuk tool args
│   └── utils/
│       ├── auth.ts              # Extract API key from header
│       ├── errors.ts            # Error normalization
│       ├── pagination.ts        # Pagination helper
│       └── formatters.ts        # Output formatting (table, list)
├── docs/
│   ├── SETUP.md                 # Setup guide untuk team member
│   ├── TOOLS.md                 # Tool reference + examples
│   └── TROUBLESHOOTING.md       # Common issues
├── .env.example                 # Dev env template
├── .gitignore
├── package.json
├── tsconfig.json
├── vercel.json                  # Vercel deployment config
└── README.md                    # Project overview
```

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Testsigma API rate limit hit saat bulk create | Medium | Medium | Implement queue dengan 200ms delay antar request |
| TMS API tidak punya public Swagger / docs minim | High | High | Phase 0 reverse-engineer via DevTools, dokumentasi internal |
| API key TMS belum tentu support semua endpoint (mungkin scoped untuk integration tertentu saja) | Medium | High | Validasi di Phase 0 dengan `curl` test setiap resource — abort kalau ternyata cuma session cookie auth |
| TMS UI pakai session cookie, bukan API key (worst case) | Medium | Critical | Mitigation: explore kalau ada PAT/token endpoint, atau pivot ke browser-based MCP |
| API key bocor di logs Vercel | Low | High | Never log auth headers, redact di error message |
| Tool description gak di-trigger Claude dengan tepat | Medium | Medium | Iterate tool description, kasih banyak example di description |
| Partial failure di bulk op | High | Medium | Return detailed summary (success/fail count + reasons) |
| Vercel cold start lambat | Low | Low | Vercel Function di hot region (Singapore SIN1) |
| Breaking change Testsigma API | Low | High | Version lock API endpoint, monitor changelog Testsigma |
| Team member bingung onboard | Medium | Medium | Tulis SETUP.md step-by-step + screenshot |

---

## 7. Security Considerations

### Authentication & Authorization
- ✅ API key dikirim via HTTP header `X-Testsigma-Key`, BUKAN URL query
- ✅ Server stateless — gak ada API key disimpan di Vercel
- ✅ Setiap request divalidasi: header present? format benar?
- ✅ Forward error 401 Testsigma ke client tanpa expose detail

### Data Privacy
- ✅ Tidak ada logging request body (test case content bisa sensitive)
- ✅ Tidak ada caching response di server
- ✅ HTTPS-only (Vercel default)

### Distribution Safety
- ✅ Repo private di GitHub
- ✅ `.env.example` saja yang di-commit (no real keys)
- ✅ Team member generate API key sendiri (audit trail tiap user)
- ✅ Vercel project access limited ke Rizqi only

---

## 8. Testing Strategy

### Local Development
- `vercel dev` untuk local testing
- Use `.env.local` dengan API key Rizqi (untuk dev only)
- Manual test setiap tool via Claude Code local config

### Pre-Deploy Checklist
- [ ] All tools return Zod-validated response
- [ ] Error cases handled (401, 404, 429, 500)
- [ ] Confirmation prompt untuk destructive ops
- [ ] Tool descriptions clear dengan example
- [ ] README + SETUP.md complete
- [ ] No hardcoded credentials anywhere

### Post-Deploy Validation
- [ ] Health check endpoint `/health` returns 200
- [ ] Connect dari Claude Code Mac → all tools listed
- [ ] Connect dari Claude Code Web → all tools listed
- [ ] Connect dari Claude Code Windows → all tools listed
- [ ] Test combo dengan Atlassian MCP berhasil
- [ ] Test invalid API key → proper 401 error

---

## 9. Onboarding Flow untuk QA Team Member

Setelah MVP deploy, onboarding new user steps:

1. **Generate Testsigma API Key**
   - Login ke `app.testsigma.com`
   - Settings → API Keys → Generate New Key
   - Copy & simpan (sekali tampil)

2. **Connect di Claude Code**
   - Web: Settings → Connectors → Add Custom MCP
     - URL: `https://testsigma-mcp.vercel.app/api/mcp`
     - Auth: Custom header `X-Testsigma-Key: <key>`
   - CLI (Mac/Win): `claude mcp add testsigma <url> --header "X-Testsigma-Key: <key>"`

3. **Test First Prompt**
   - Coba: "List my Testsigma projects"
   - Expected: tampil list project (e.g., GROW)

4. **Reference Docs**
   - Baca `docs/TOOLS.md` untuk list tools + examples
   - Lihat `docs/TROUBLESHOOTING.md` kalau ada issue

**Target onboarding time: < 10 menit per user.**

---

## 10. Success Metrics (Post-MVP)

### Quantitative
- Time saved per task: target 70% reduction
  - Manual create test case: ~5 min → MCP: ~30 sec
  - Bulk scaffolding 10 tickets: ~45 min → MCP: ~2 min
- Number of users onboarded di 2 minggu pertama: target 3 (Rizqi + 2 colleague)
- API calls per week (proxy untuk usage): target > 50 calls

### Qualitative
- Apakah feel "natural" untuk daily workflow?
- Apakah error messages helpful?
- Apakah combo dengan Atlassian MCP terasa useful?

---

## 11. Open Questions & Decisions Pending

| Question | Status | Decision Needed By |
|----------|--------|-------------------|
| Mau pakai Vercel Hobby (free) atau Pro? | TBD | Before deploy |
| Logging strategy (no log? Vercel logs? external?) | TBD | Phase 1 |
| Confirmation prompt: di MCP server atau trust Claude side? | Decided: trust Claude | Done |
| Pagination strategy: cursor-based atau offset? | TBD | Phase 1 |
| Tool response format: JSON raw atau markdown table? | TBD: markdown for readability | Phase 1 |
| Rate limit handling: queue di server atau retry di client? | TBD | Phase 2 |

---

## 12. Future Roadmap (Post-Phase 5)

### Nice-to-Have Tools
- `run_test_plan` — trigger execution (async via webhook)
- `get_execution_result` — poll status hasil run
- `summarize_run_failures` — aggregate failed steps
- `find_flaky_tests` — query history, calculate flakiness score
- `bulk_tag` — apply tag ke multiple test cases
- `clone_test_case` — duplicate dengan modification

### Integrations
- Slack MCP combo: notify Slack saat bulk operation selesai
- Confluence MCP combo: auto-generate test plan documentation
- Sentry MCP combo: link production error → test case coverage

### Advanced Features
- Caching layer (Redis/KV) untuk frequently-accessed data
- Webhook receiver dari Testsigma untuk real-time updates
- Dashboard view di Claude artifact (visualisasi test coverage)

---

## 13. References & Resources

Semua source URL (Testsigma docs, MCP spec, Atlassian Marketplace listing) dikonsolidasi di [`docs/REFERENCE.md` §9 Source Documents](./docs/REFERENCE.md#9-source-documents). File ini hanya menyimpan link planning/process:

- **Atlassian MCP:** Already connected (Jira + Confluence) — referenced di Phase 3 + 5

---

## 14. Approval & Next Steps

**Ready to start?** Setelah Rizqi approve plan ini, next action:

1. ✅ Confirm plan
2. → Generate full boilerplate code (Phase 1+2)
3. → Setup Vercel project step-by-step
4. → Local test
5. → Deploy MVP

---

*Document version: 1.0 | Last updated: May 19, 2026*
