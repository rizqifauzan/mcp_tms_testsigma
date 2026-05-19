# Testsigma MCP Server — Project Plan

**Owner:** Rizqi
**Goal:** Build custom MCP server untuk integrasi **Testsigma Test Management (TMS standalone)** — `test-management.testsigma.com` — dengan Claude Code, distributable ke QA team.
**Start Date:** May 2026
**Target MVP:** 1-2 hari kerja

> ⚠️ **Product clarification:** Target adalah **Testsigma Test Management** (TMS — `test-management.testsigma.com`), BUKAN Testsigma automation platform (`app.testsigma.com`). Keduanya produk berbeda dengan API berbeda. TMS fokus ke test case management, folder hierarchy, test plans, requirements traceability — tidak ada NLP test step grammar.

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
- ❌ Auto-record UI test steps (butuh browser recorder)
- ❌ Run test execution + wait result (long-running, butuh async pattern)
- ❌ UI element locator generation
- ❌ Full test step CRUD dengan NLP grammar (deferred ke Phase 4-5)

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

### Phase 0 — API Discovery (Confidence: 🟡 Medium) ⭐ NEW
**Goal:** Reverse-engineer TMS REST API karena public docs tipis.

**Approach:**
1. Login ke `test-management.testsigma.com`, buka DevTools → Network
2. Capture request untuk setiap action: list projects, open folder, view test case, create TC, update TC, list test plans, run trigger
3. Document:
   - Base URL (e.g., `test-management.testsigma.com/api/v1/...` — TBD)
   - Auth header format (Bearer? `Authorization`? custom header?)
   - Resource model: project → folder tree → test case → steps (plain text di TMS, BUKAN NLP)
   - Pagination shape (offset vs cursor)
   - Required vs optional fields di create payload
4. Bikin `docs/API_NOTES.md` sebagai single source of truth
5. Validasi: bisa generate API key dari TMS settings? scope-nya apa?

**Estimated effort:** 2-3 jam
**Risk:** Medium (kalau API key TMS gak tersedia / butuh session cookie, blocker total)
**Exit criteria:** Bisa `curl` dapet list project pakai API key.

### Phase 1 — Read-Only Tools (Confidence: 🟢 High)
**Goal:** User bisa browse TMS data dari Claude tanpa buka UI.

> Endpoint paths di bawah ini **placeholder** — finalisasi setelah Phase 0.

| Tool | Endpoint (TBD) | Use Case |
|------|----------|----------|
| `list_projects` | `GET /projects` | "Show me my Testsigma TMS projects" |
| `get_project` | `GET /projects/{id}` | "Detail project GROW" |
| `list_folders` | `GET /projects/{id}/folders` | "Show folder tree GROW" |
| `list_test_cases` | `GET /folders/{id}/test_cases` (or by project) | "List test case di folder Voucher" |
| `get_test_case` | `GET /test_cases/{id}` | "Show detail TC-1234" |
| `list_test_plans` | `GET /test_plans?projectId=X` | "What test plans di GROW?" |
| `get_test_plan` | `GET /test_plans/{id}` | "Detail Regression Plan" |
| `list_test_suites` | `GET /test_suites?projectId=X` | "What suites are in GROW?" |
| `search_test_cases` | `GET /test_cases/search` | "Find test cases with 'voucher'" |

**Estimated effort:** 2-3 jam
**Risk:** Low (read-only, no destructive ops)

### Phase 2 — Full Test Case CRUD (Confidence: 🟢 High)
**Goal:** Create/update/delete test case INCLUDING steps. Di TMS standalone, test step = plain text (title + expected result), TIDAK ada NLP grammar — jadi step CRUD masuk MVP.

| Tool | Endpoint (TBD) | Behavior |
|------|----------|----------|
| `create_test_case` | `POST /test_cases` | Create dengan nama, deskripsi, priority, type, folder, steps[] |
| `update_test_case` | `PUT /test_cases/{id}` | Update metadata + steps |
| `delete_test_case` | `DELETE /test_cases/{id}` | Delete dengan confirmation prompt |
| `add_step` | `POST /test_cases/{id}/steps` | Append step (action + expected) |
| `update_step` | `PUT /test_steps/{id}` | Edit step text |
| `delete_step` | `DELETE /test_steps/{id}` | Remove step |
| `create_folder` | `POST /folders` | Organize TC ke folder baru |

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

### Phase 4 — Test Plans & Runs (Confidence: 🟡 Medium) ⭐ REVISED
**Goal:** Manage test plans (collection of TC) dan record manual run results.

TMS adalah **test management**, bukan automation runner — jadi "execution" di sini artinya update status manual (Pass/Fail/Blocked/Skip) per TC di test run, bukan trigger automation.

| Tool | Endpoint (TBD) | Notes |
|------|----------|-------|
| `create_test_plan` | `POST /test_plans` | Collection of TC IDs |
| `add_tc_to_plan` | `POST /test_plans/{id}/test_cases` | Bulk add |
| `start_test_run` | `POST /test_runs` | Open new run dari plan |
| `update_run_result` | `PUT /test_runs/{id}/results/{tcId}` | Mark TC Pass/Fail dengan comment |
| `get_run_summary` | `GET /test_runs/{id}/summary` | Aggregate pass/fail count |

**Estimated effort:** 3-4 jam
**Risk:** Medium (state machine result, comment formatting)

### Phase 5 — Requirements & Jira Traceability (Confidence: 🟡 Medium) ⭐ REVISED
**Goal:** TMS native feature: link TC ↔ Jira issue (requirement traceability).

| Tool | Endpoint (TBD) | Notes |
|------|----------|-------|
| `link_tc_to_jira` | `POST /test_cases/{id}/requirements` | Attach Jira key sebagai requirement |
| `list_tc_for_requirement` | `GET /requirements/{jiraKey}/test_cases` | Reverse lookup |
| `coverage_report` | Custom aggregation | "Which Jira issues belum punya TC?" |

**Estimated effort:** 2-3 jam
**Risk:** Medium (tergantung apakah TMS punya native Jira link field atau pakai tag)

---

## 4. Timeline

### MVP Sprint (Phase 0-3) — Target: 2 hari

| Day | Time | Activity |
|-----|------|----------|
| Day 1 AM | 2-3 jam | **Phase 0:** API discovery via DevTools, dokumentasi endpoint |
| Day 1 AM | 1 jam | Setup repo, Vercel project, deps, TypeScript config |
| Day 1 PM | 1 jam | MCP transport skeleton + handshake test |
| Day 1 PM | 2 jam | Phase 1: Read-only tools (8-9 tools) |
| Day 1 PM | 1 jam | Local testing dengan Claude Code |
| Day 2 AM | 3 jam | Phase 2: Full CRUD (incl. steps + folders) |
| Day 2 AM | 30 min | Deploy ke Vercel production |
| Day 2 PM | 1 jam | Phase 3: Test combo dengan Atlassian MCP |
| Day 2 PM | 1.5 jam | README, onboarding doc, error polishing |
| **Total** | **~13 jam** | **MVP shipped** |

### Follow-up (Phase 4-5) — Target: 1 minggu setelah MVP

| Week | Activity |
|------|----------|
| Week 2, Day 1 | Phase 4: Schema reverse-engineering session |
| Week 2, Day 2-3 | Phase 5: Step CRUD implementation |
| Week 2, Day 4 | Integration testing + documentation update |
| Week 2, Day 5 | Soft launch ke 1-2 QA colleagues (Ashish, Sebastian) untuk feedback |

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

- **MCP Specification:** https://spec.modelcontextprotocol.io
- **Vercel MCP Adapter:** https://github.com/vercel/mcp-adapter
- **Testsigma API Docs (automation platform — beda product):** https://testsigma.com/docs/api/overview/
- **Testsigma TMS docs:** https://testsigma.com/docs/test-management/
- **Manage Test Cases di TMS:** https://testsigma.com/docs/test-management/test-cases/manage-test-cases/
- **API Keys (lokasi generate di TMS):** Settings → API Keys (perlu konfirmasi apakah API key TMS = automation, atau key terpisah)
- **Atlassian MCP:** Already connected (Jira + Confluence)

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
