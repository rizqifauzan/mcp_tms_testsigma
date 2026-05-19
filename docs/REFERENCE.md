# Testsigma TMS — Consolidated Reference

> Single source of truth untuk semua fakta yang dipakai di `PROJECT_PLAN.md` dan implementasi. Update file ini saat ada penemuan baru (terutama dari Phase 0 API discovery). Plan dan code wajib konsisten dengan file ini.

**Last verified:** 2026-05-19
**Status:** Phase 0 — **read endpoints captured via authenticated probe.** Writes (POST/PUT/DELETE), lookup tables, requirements/Jira link still need DevTools capture. See [`PHASE_0_DISCOVERY.md`](./PHASE_0_DISCOVERY.md).

---

## 1. Product Identity

| Attribute | Value |
|---|---|
| **Product name** | Test Management by Testsigma (TMS) |
| **UI URL** | `https://test-management.testsigma.com/ui/dashboard` |
| **Vendor** | Testsigma Inc. |
| **Type** | Standalone Test Case Management System (TCMS) |
| **NOT to be confused with** | Testsigma automation platform (`app.testsigma.com`) — produk berbeda dengan API berbeda |
| **Tagline** | "Unified AI-Agentic Test Management Software" |
| **Listed on** | Atlassian Marketplace ($10/user/month) |

### Key distinction vs Testsigma automation platform
- TMS = test case **management** (manual + automation tracking) — fokus pada planning, organization, traceability
- Automation platform = test **execution engine** dengan NLP/codeless steps
- Test steps di TMS = plain text (action + expected), TIDAK ada NLP grammar parsing
- API base URL & key kemungkinan berbeda antara dua produk ini (perlu konfirmasi Phase 0)

---

## 2. Entity Model & Hierarchy

```
Workspace / Org
└── Project
    ├── Folders (tree, nested unlimited)
    │   └── Test Cases
    │       ├── Steps (action + expected result)
    │       ├── Attachments
    │       ├── Labels
    │       └── Custom Fields
    ├── Test Suites (collection of test cases)
    └── Test Plans (strategy + test suites + execution config)
        └── Test Runs (instance of executing a plan)
            └── Result per Test Case (Pass/Fail/Blocked/Skip + comment)
```

### Test Case Fields (confirmed via Phase 0 API probe — 2026-05-19)

> ⚠️ **Schema differs significantly from earlier doc-based assumptions.** The TMS API uses a flat "TCD" (Test Case Document) template where steps and expected results are single text blobs separated by newlines — NOT an array of `{action, expected}` step objects. This invalidates the per-step CRUD assumption in [`PROJECT_PLAN.md` §3 Phase 2](../PROJECT_PLAN.md). Step-level operations will edit substrings of `steps` field, not array elements.

API response shape from `GET /projects/{id}/test_cases/{tc_id}`:

```json
{
  "id": "<uuid>",
  "title": "<string>",
  "description": "<string>",
  "template_type": "TCD",
  "preconditions": "<string>",
  "steps": "Step 1 action.\nStep 2 action.\nStep 3 ...",
  "expected_results": "Expected for step 1.\nExpected for step 2.\n...",
  "human_id": "GR-7",
  "owner_id": "<uuid>",
  "type_id": "<uuid>",
  "status_id": "<uuid>",
  "automation_type_id": "<uuid>",
  "priority_id": "<uuid>",
  "folder_id": "<uuid>",
  "project_id": "<uuid>",
  "labels": [{"id":"<uuid>","name":"<str>","createdAt":<epoch_ms>,"updatedAt":<epoch_ms>}],
  "created_at": <epoch_ms>,
  "updated_at": <epoch_ms>
}
```

Notable observations:
- `title`, not `name`
- `steps`, `expected_results`, `preconditions`, `description` are all **plain strings** (likely newline-delimited; rich-text format TBD)
- `template_type: "TCD"` — other templates may exist (BDD?); not yet observed
- Status / priority / type / automation_type are UUID refs to lookup tables — **the lookup endpoint has not been found via probing** (returned 404 for `/property_definitions`, `/properties`, `/options`, etc.). Must capture via DevTools.
- `labels` is an embedded array of objects (`createdAt`/`updatedAt` camelCase — inconsistent with surrounding snake_case fields)
- `human_id` follows pattern `{project.human_id_prefix}-{N}` (e.g. `GR-7`)
- **`requirements` / Jira issue keys field NOT present in response** — must be capturing from a different endpoint or not exposed via API; defer until DevTools captures it

### Folders
- Hierarchical tree structure (folders + subfolders, unlimited nesting)
- Test cases live inside folders
- Folder = organizational unit; doesn't have execution semantics

### Test Suites
- Flat collection of test cases (a TC can belong to multiple suites)
- Used for grouping by feature/scenario for execution
- Has its own Pre-Requisite field
- ⚠️ **Phase 0 finding:** No REST endpoint exposing test_suites was discovered (see §5 Test Suites). Either this is UI-only, named differently, or not in this account's plan. Confirm before relying on suites in MCP design.

### Test Plans
- High-level execution strategy (scope, objectives, environment)
- Contains one or more Test Suites
- Supports scheduling
- Generates Test Runs when executed

### Test Runs (Executions)
- Instance of a plan execution at a point in time
- Per-TC result: Pass / Fail / Blocked / Skip + comment + attachments
- Results sync back to linked Jira issues (two-way)

---

## 3. Authentication

### Confirmed via Phase 0 (2026-05-19)
- **Method:** `Authorization: Bearer <TOKEN>` — token is a **JWT** (HS256), not a static API key
- **JWT payload observed:** `{"iss":"TMS","sub":"<user_uuid>","nbf":<epoch>,"iat":<epoch>,"id_session_re_validate":0}` — **no `exp` claim** (or exp lives outside JWT, enforced server-side via session)
- **Source of token:** Captured from a logged-in browser session (DevTools / cookies). It is the same JWT the SPA uses to call its own backend.
- **Rate limit headers visible:**
  - `x-tms-api-limit: 10`
  - `x-tms-api-remaining: <decreasing>`
  - `x-tms-api-reset: <negative_number>` (semantics unclear; observed `-1779181353` ~= negated current epoch; treat as "no published reset window")

### ⚠️ Still unknown — escalate before Phase 1 coding
- **Open Question #1 (Critical):** Is there a long-lived API key option (TMS Settings → API Keys panel)? Or is the JWT session token the ONLY auth mechanism for `test-management.testsigma.com`? If only JWTs are available, the MCP stateless model has a problem: tokens expire, and users would need to re-paste them. **User must check the TMS UI Settings menu.**
- Whether TMS API keys (if they exist) are shared with `app.testsigma.com` automation platform.
- Rate limit window: 10 requests per **what** (second/minute/hour)? Not documented in headers.

### Fallback / blocker risk
- ⚠️ **Confirmed partial blocker:** A JWT pulled from a browser session works, but is short-lived and tied to a logged-in user. For a multi-user MCP distributed to QA team, every user would need to repeatedly paste fresh JWTs unless TMS exposes API keys.
- Mitigations if blocker confirmed:
  - Ask Testsigma support about PAT availability for TMS
  - Document "paste browser JWT" workflow as MVP, with caveats
  - Long-term: pivot to a session-refresh proxy (significantly more complex)

---

## 4. REST API

### ✅ Confirmed via Phase 0 authenticated probing (2026-05-19)

| Fact | Detail |
|---|---|
| **Base URL** | `https://test-management.testsigma.com/api/v1/` |
| **Auth** | `Authorization: Bearer <JWT>` — see §3 |
| **API version** | Only `v1` exists (v2/v3/v4 → 404) |
| **Path style** | snake_case for resources (`test_cases`, `test_runs`, `folders`) — camelCase variants (`testCases`) return 404 |
| **Resource hierarchy** | Most resources are nested under `/projects/{project_id}/` (folders, test_cases, test_plans, test_runs). Globals: `/projects`, `/labels`, `/users` |
| **Response envelope (collections)** | `{ "message": "<descriptive>", "data": { "<resource_name>": [...] }, "page_info": {...} }` |
| **Response envelope (single)** | `{ "message": "<descriptive>", "data": { "<singular_resource>": {...} } }` |
| **Envelope inconsistency** | `/users` returns `data: [...]` directly (no `users` wrapper). Worth special-casing in client. |
| **Pagination** | **Cursor-based.** `page_info: { page_size, total_count, next, prev }` — `next`/`prev` are base64-encoded JSON cursors. Decoded form: `[{"field":"<table>.tsid","value":"<ULID>","direction":"ASC|DESC"}]` |
| **Internal record ID** | Backend uses ULIDs in `tsid` columns (visible only in pagination cursors). Public API exposes UUIDs as primary `id`. |
| **Timestamps** | All `created_at`/`updated_at` are epoch milliseconds as integers |
| **Naming inconsistency** | Embedded `labels[]` use camelCase (`createdAt`, `updatedAt`) while everything else is snake_case |
| **Filter params (test_cases)** | `?folder_id=<uuid>` works, `?search=<term>` works. `?q=` and `?filter=` are silently ignored. |
| **Error envelope (404)** | `{"code":404,"message":"Not Found"}` — 35 bytes flat |
| **Error envelope (validation)** | `{"message":"<msg>","errors":{"code":400,"message":"<msg>","details":"<detail>"}}` |
| **Error envelope (not-found-with-id)** | `{"message":"<entity> not found","errors":{"code":404,"message":"...","details":"<entity> not found with ID: <uuid>"}}` |
| **Request ID** | `x-request-id: <uuid>` on every response — quote in support tickets |
| **Rate limit** | Headers `x-tms-api-limit: 10`, `x-tms-api-remaining: <n>`, `x-tms-api-reset: <negative>`. Window unit unknown. |
| **CORS** | OPTIONS auth-gated. Server-to-server only. |
| **Swagger / OpenAPI** | NOT exposed (`/swagger.json`, `/openapi.json`, `/api-docs` all 404 even with valid JWT). |
| **GraphQL** | `POST /graphql` returns 404 (the unauthenticated 401 was misleading — auth gate fires before route resolution). REST is the only API. |

### Discovery plan (Phase 0)
1. Login ke `test-management.testsigma.com`, buka Chrome DevTools → Network → filter `Fetch/XHR`
2. Capture request untuk setiap action:
   - Load dashboard (list projects)
   - Open project (list folders)
   - Open folder (list test cases)
   - Open test case (get detail + steps)
   - Create test case
   - Update test case
   - Delete test case
   - Create test suite
   - Create test plan
   - Start test run
   - Mark TC result
   - Link to Jira issue
3. Dokumentasi tiap endpoint ke section [§5 Endpoints Reference](#5-endpoints-reference) di file ini
4. Catat:
   - HTTP method + path
   - Required headers (auth, content-type, custom)
   - Path params + query params
   - Request body schema
   - Response shape
   - Pagination style (offset/cursor/page)
   - Status codes yang mungkin

### Hipotesis (status update)
- ✅ Base URL `/api/v1/` — **confirmed**
- ⏳ Resource path style snake vs camel — **inconclusive without API key** (auth gate fires before routing)
- ⏳ ID-based vs slug-based — TBD
- ⏳ Pagination shape — TBD
- ⏳ Whether TMS exposes a Swagger doc once authenticated — **highly probable** (`/api/v1/swagger.json` returns 401, not 404)

---

## 5. Endpoints Reference

> Read endpoints confirmed via Phase 0 (2026-05-19). Write endpoints (POST/PUT/DELETE) NOT YET PROBED — defer to DevTools capture during a real create/update action.

### Projects
- [x] `GET /projects` — list. Response: `data.projects[]`. Per-item: `{ id, name, description, human_id_prefix, created_at, updated_at }`
- [x] `GET /projects/{id}` — detail. Response: `data.project`.
- [ ] `POST /projects` — TBD (DevTools)
- [ ] `PUT /projects/{id}` — TBD
- [ ] `DELETE /projects/{id}` — TBD

### Folders
- [x] `GET /projects/{project_id}/folders` — list. Response: `data.folders[]`. Per-item: `{ id, name, project_id, parent_folder_id, order, children: [] }`. `children` always empty in collection response — must traverse via `parent_folder_id` recursion or fetch detail.
- [x] `GET /projects/{project_id}/folders/{folder_id}` — detail. Response: `data.folder`.
- ⚠️ `/projects/{id}/folders/{folder_id}/test_cases` → 404. Use `?folder_id=` filter on `/test_cases` instead.
- ⚠️ No `/folders/tree` endpoint. Build the tree client-side from the flat list.
- [ ] `POST /projects/{project_id}/folders` — TBD (DevTools)
- [ ] `PUT/DELETE` — TBD

### Test Cases
- [x] `GET /projects/{project_id}/test_cases` — list with filters
  - Query: `?folder_id=<uuid>`, `?search=<term>` — both confirmed working
  - Pagination: cursor via `page_info.next` (base64 string) — verify on next iteration
  - Response: `data.test_cases[]`
- [x] `GET /projects/{project_id}/test_cases/{tc_id}` — detail. Response: `data.test_case` — see §2 "Test Case Fields" for full shape.
- ⚠️ No separate `/steps`, `/attachments`, `/requirements`, `/comments`, `/history` sub-resources on test cases (all return 404). Steps are part of the `steps` string field.
- [ ] `POST /projects/{project_id}/test_cases` — TBD (DevTools)
- [ ] `PUT /projects/{project_id}/test_cases/{tc_id}` — TBD
- [ ] `DELETE /projects/{project_id}/test_cases/{tc_id}` — TBD

### Test Suites
- ❌ **No `/test_suites` endpoint discovered.** Tried: `/test_suites`, `/projects/{id}/test_suites`, `/projects/{id}/test_case_suites`, `/projects/{id}/suites`. All 404.
- Hypothesis: Test Suites may be a UI-only abstraction over filtered TC lists, OR they live under a different name (e.g. "dynamic_selection_filters" on a test run — see Test Runs entity below), OR this org's plan tier doesn't include them.
- **Action:** Confirm in TMS UI whether Test Suites exist for this account. Capture via DevTools if so.

### Test Plans
- [x] `GET /projects/{project_id}/test_plans` — list. Response: `data.test_plans[]` (empty on this account — schema unknown).
- [ ] `GET /projects/{project_id}/test_plans/{plan_id}` — TBD
- [ ] `POST /projects/{project_id}/test_plans` — TBD

### Test Runs
- [x] `GET /projects/{project_id}/test_runs` — list. Response: `data.test_runs[]`. Per-item shape:
  ```json
  {
    "id": "<uuid>", "title": "<string>", "description": "<string>",
    "human_id": "GR-R-1",
    "status": "ACTIVE",
    "selection_type": "DYNAMIC",
    "dynamic_selection_filters": [],
    "dynamic_selection_excluded_test_case_ids": null,
    "start_date": <epoch_ms>, "end_date": <epoch_ms>,
    "assignee_id": "<uuid>", "project_id": "<uuid>",
    "labels": [], "environments": null,
    "test_plan_id": "",
    "test_cases_count": <int>,
    "test_run_status_summary": null,
    "created_at": <epoch_ms>, "updated_at": <epoch_ms>
  }
  ```
- [x] `GET /projects/{project_id}/test_runs/{run_id}` — detail. Same shape as collection item.
- [x] `GET /projects/{project_id}/test_runs/{run_id}/test_cases` — per-TC results. Response: `data.test_run_cases[]`. Shape:
  ```json
  {
    "id": "<run_tc_uuid>",
    "assignee_id": "<uuid_or_empty>",
    "status_id": "<uuid>",
    "assignee": null,
    "status": "Passed",          // ← resolved name; possible values to be enumerated
    "test_case": { ...embedded TC subset... }  // no preconditions field in embedded copy
  }
  ```
- ⚠️ `/test_runs/{id}/results` and `/test_runs/{id}/summary` → 404. Status summary appears in run detail as `test_run_status_summary` (null on inactive runs — must capture an active run to see shape).
- [ ] `POST /projects/{project_id}/test_runs` — TBD
- [ ] `PUT /test_runs/{run_id}/test_cases/{run_tc_id}` (or similar) for marking Pass/Fail — TBD

### Labels (global)
- [x] `GET /labels` — list. Response: `data.labels[]`. Per-item: `{ id, name, createdAt, updatedAt }` (camelCase!)
- [ ] CRUD — TBD

### Users (global)
- [x] `GET /users` — list. Response envelope: `data` is the array directly (no wrapper key). Per-item: `{ id, email, first_name, last_name, identity_user_uuid, status, created_at, updated_at }`
- ⚠️ `/me`, `/users/me`, `/auth/whoami`, `/identity/me` all 404. Current user must be identified via JWT `sub` claim → cross-reference against `/users[].identity_user_uuid` (NOT `id`).

### Lookup tables (status / priority / type / automation_type)
- ❌ **No discoverable lookup endpoint** for resolving the `status_id` / `priority_id` / `type_id` / `automation_type_id` UUIDs on a test case to human-readable names. Tried: `/properties`, `/property_definitions`, `/options`, `/test_case_options`, `/lookups`, `/dropdowns`, and project-nested variants. All 404.
- **Indirect resolution:** The `/test_runs/{run_id}/test_cases` response includes a resolved `status` name alongside `status_id` for run results, but only for run-result statuses, not for TC lifecycle statuses (Draft/Active/etc).
- **Action:** Highest-priority DevTools capture — open "Manage Properties" in TMS UI Settings and capture the API call. Without this, the MCP can't show meaningful values.

### Requirements / Jira link
- ❌ Not present in TC detail response. Tried: `/test_cases/{id}/jira_issues`, `/linked_issues`, `/integrations`. All 404.
- **Action:** Capture during a "Link Jira issue to TC" UI action.

---

## 6. Native Integrations (Relevant ke MCP)

### Jira (two-way) — confirmed
- Native field "Requirements" di test case → store Jira issue keys
- Two-way sync: status, comments, results
- Test runs auto-create Jira issues for failures (with screenshots)
- Marketplace app: "Test Management by Testsigma" di Atlassian Marketplace
- **Relevance ke MCP:** combo dengan Atlassian MCP jadi powerful — coverage report, bulk scaffolding TC dari Jira

### Other integrations (documented, not in MCP scope)
- Azure DevOps (two-way test management)
- TestRail (import only)
- CI/CD (Jenkins, GitHub Actions via generic REST API)

### AI agents bawaan TMS (don't replicate)
- **Generator Agent** — generate TC dari user story (Jira/Confluence)
- **Sprint Planner Agent** — plan tests when Jira sprint starts
- **Runner Agent** — execute tests in browser
- **Bug Reporter Agent** — auto-create bug reports with logs/screenshots

> **Strategic note:** MCP kita gak replace agents ini. MCP value = bisa dipanggil dari Claude Code workflow (paralel dengan code review, edit, etc) — bukan menggantikan native TMS AI.

---

## 7. Import / Export

- **Format:** CSV (Excel harus dikonversi dulu)
- **Trigger UI:** Test Cases page → Import button (top right), atau Dashboard → Import Test Cases
- **Migration:** Project-to-project import didukung (matching application type)
- **Bulk update:** via Command Center (Cmd+K → Bulk Update Test Cases)
- **MCP relevance:** Bulk operations bisa expose lewat tool `bulk_create_test_cases` dengan CSV-like array input

---

## 8. Known Limitations & Open Questions

| # | Question | Status | Impact | How to resolve |
|---|---|---|---|---|
| 1 | API key TMS = automation key, atau terpisah? Apakah ada API key sama sekali, atau cuma JWT session? | **Partially open** — JWT confirmed working; long-lived key not yet found | Critical | User must check TMS UI Settings menu for an "API Keys" panel |
| 2 | API base URL exact path? | ✅ **Closed** — `/api/v1/` on `test-management.testsigma.com` | Critical | — |
| 3 | API key scope penuh atau limited? | ✅ **Closed (partially)** — JWT covers all read endpoints tested (projects, folders, test_cases, test_runs, test_plans, labels, users). Writes not yet tested. | High | Write probe deferred until safe to mutate |
| 4 | Pagination style? | ✅ **Closed** — cursor-based, base64-encoded JSON, `page_info: {page_size, total_count, next, prev}` | Medium | — |
| 5 | Rate limits? | **Partially open** — `x-tms-api-limit: 10` header observed, unit unknown | Medium | Capture during a high-volume DevTools session, or ask Testsigma support |
| 6 | Step attachment upload flow? | Low (skip MVP) | Defer; tool tanpa attachment dulu |
| 7 | Custom field schema discovery? | Medium | Inspect per-project response payload |
| 8 | Project ID vs slug di URL? | Low | DevTools inspection |
| 9 | Apakah ada webhook/event API? | Low | Defer ke future roadmap |
| 10 | Multi-tenant: workspace concept? | Medium | Cek URL setelah login (mungkin ada `/workspaces/{id}/`) |

---

## 9. Source Documents

### Official Testsigma docs
- TMS hub: https://testsigma.com/docs/test-management/
- Test cases (TMS): https://testsigma.com/docs/test-management/test-cases/manage-test-cases/
- Test plans overview: https://testsigma.com/docs/test-management/test-plans/overview/
- Test plans — manage suites: https://testsigma.com/docs/test-management/test-plans/manage-test-suites/
- Test plans — schedule: https://testsigma.com/docs/test-management/test-plans/schedule-plans/
- Requirements: https://testsigma.com/docs/projects/requirements/
- Imports (TestRail): https://testsigma.com/docs/test-management/imports-and-exports/testrail/
- Azure DevOps integration: https://testsigma.com/docs/test-management/integrations/azure-two-way-integration/manage-test-cases-in-azure-devops/

### Cross-product (automation platform, beda API tapi pola mirip)
- API overview: https://testsigma.com/docs/api/overview/
- API keys: https://testsigma.com/docs/configuration/api-keys/
- Trigger test plans: https://testsigma.com/docs/api/test-plans/
- Environments API: https://testsigma.com/docs/api/environments/

### Marketplace
- Atlassian Marketplace listing: https://marketplace.atlassian.com/apps/3339724813/test-management-by-testsigma-integration-for-jira

### MCP-related
- MCP spec: https://spec.modelcontextprotocol.io
- Vercel MCP adapter: https://github.com/vercel/mcp-adapter

---

## 10. Changelog

| Date | Change | By |
|---|---|---|
| 2026-05-19 | Initial consolidation from web research + PROJECT_PLAN v1.0 | Claude (with Rizqi clarification on TMS vs automation) |
| 2026-05-19 | Phase 0 authenticated probe: closed Q2/Q3/Q4. Captured shapes for projects, folders, test_cases (detail + list), test_plans, test_runs, run/test_cases, labels, users. Surfaced major schema discovery — `steps`/`expected_results` are newline-delimited strings, not arrays of `{action, expected}`. No swagger, no GraphQL, no test_suites endpoint, no lookup tables endpoint, no requirements field on TC discovered. | Claude (using JWT session token shared by Rizqi) |
