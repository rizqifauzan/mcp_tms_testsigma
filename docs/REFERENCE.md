# Testsigma TMS — Consolidated Reference

> Single source of truth untuk semua fakta yang dipakai di `PROJECT_PLAN.md` dan implementasi. Update file ini saat ada penemuan baru (terutama dari Phase 0 API discovery). Plan dan code wajib konsisten dengan file ini.

**Last verified:** 2026-05-19
**Status:** Phase 0 ✅ **DONE.** Official Postman collection ingested; all major resource endpoints + body shapes documented (§5). Outstanding minor items tracked in §8 — none block Phase 1 coding.

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
- **Two template types exist:**
  - `"TCD"` — `steps` and `expected_results` are plain newline-delimited strings (single text blob each). No structured step objects. This is what `GR-7` uses in our account.
  - `"STEPS"` — uses an additional field `individual_steps[]: [{step_description, expected_results, order, step_type, step_group_id}]`. Granular step CRUD becomes possible. `step_type` observed value: `"DEFAULT"` (other values TBD — possibly API call, data-driven, etc.).
- Status / priority / type / automation_type are UUID refs to lookup tables. **Lookup endpoints are at ROOT, not under `/projects/{id}/`:**
  - `GET /api/v1/test_cases/statuses`
  - `GET /api/v1/test_cases/priorities`
  - `GET /api/v1/test_cases/types`
  - `GET /api/v1/test_cases/automation_types`
  - `GET /api/v1/test_runs/statuses`
- `labels` embedded array uses camelCase (`createdAt`/`updatedAt`) — inconsistent with surrounding snake_case
- `human_id` follows pattern `{project.human_id_prefix}-{N}` (e.g. `GR-7`)
- **Test case URLs accept either UUID or human_id** (`/test_cases/DEMO-2` works) — flexible routing
- **`requirements` / Jira issue keys field NOT in API response** — confirmed dropped from MVP scope (see [PROJECT_PLAN §3](../PROJECT_PLAN.md))

### Step Groups (new entity — not in original plan)
Reusable bundles of structured steps. Separate first-class resource at `/projects/{pid}/step_groups`.

```json
{
  "title": "<string>",
  "description": "<string>",
  "label_ids": ["<uuid_or_name>"],
  "steps": [
    { "step_description": "<string>", "expected_result": "<string>", "order": <int> }
  ]
}
```

Step groups can be embedded into a test case's `individual_steps` via `step_type: "STEP_GROUP"` (presumed) and `step_group_id: "<uuid>"`. Provides a DRY pattern for repeated step sequences (e.g. "Login" preface).

### Folders
- Hierarchical tree structure (folders + subfolders, unlimited nesting)
- Test cases live inside folders
- Folder = organizational unit; doesn't have execution semantics

### Test Suites
- ⚠️ **CONFIRMED NOT IN API.** Official Postman collection has zero `test_suites` endpoints. The concept of a "static list of TCs grouped for execution" is replaced by **`static_selection_filters`** on a test run (see Test Runs below).
- If TMS UI shows a "Test Suites" menu, it's a UI-side abstraction — not exposed for MCP integration. **Dropped from MCP scope.**

### Test Plans
- Container for runs over a time window. Body: `{title, description, start_date, end_date, label_ids[]}` — no direct `suites[]` or `test_cases[]` link.
- Has a **`complete`** action: `POST /test_plans/{id}/complete`.
- Lists its runs via `GET /test_plans/{id}/test_runs`.
- Relationship to runs: a run can carry a `test_plan_id` to associate itself with a plan.

### Test Runs (Executions)
- Instance of execution. Carries selection logic directly (no suite layer).
- **`selection_type`:**
  - `"STATIC"` — explicit list via `static_selection_filters: [{field, operator, values[]}]` (e.g. `{field:"id", operator:"IN", values:[<uuid>,...]}`)
  - `"DYNAMIC"` — filters evaluated at run time (shape: `dynamic_selection_filters[]` + `dynamic_selection_excluded_test_case_ids`)
- Per-TC result: `test_run_status_id` (UUID, resolved via `/test_runs/statuses`) + optional description + attachments
- Mark result endpoint uses **multipart/form-data** with JSON in field `data` and files as `attachments_<run_case_index>_<n>` (see §5 Test Runs)
- Assign user to a TC inside a run: `PUT /test_runs/{rid}/assign_user` with `{user_id, test_case_id}`
- JUnit XML import to populate run results: `POST /projects/{pid}/junit-import/test-run/{rid}` (multipart, async — poll `/junit-imports/{import_id}/status`)
- Results sync back to linked Jira issues (two-way) — documented in product docs but **no MCP-facing API**

---

## 3. Authentication

### Decision (2026-05-19)
**MCP server accepts ONLY long-lived API keys.** JWT session tokens are usable for dev probing but NOT supported as a user-facing auth path in the deployed MCP. Each QA team member generates their own API key from TMS UI → Settings → API Keys → "Generate new API Key".

### Confirmed
- **Method:** `Authorization: Bearer <API_KEY>` on every request
- **Source:** TMS UI Settings → API Keys panel (user-confirmed 2026-05-19)
- **MCP distribution:** users paste their API key into Claude Code config via `X-Testsigma-Key` HTTP header. The Vercel function rewrites that as `Authorization: Bearer <key>` to TMS. Server stateless — no key stored.
- **Audit:** because each user uses their own key, TMS-side audit log attributes actions to the correct user.
- **Rate limit headers visible:** `x-tms-api-limit: 10`, `x-tms-api-remaining: <decreasing>`, `x-tms-api-reset: <negative_number>` (semantics unclear; window unit not documented — measure empirically in Phase 1)

### Reference only (not used by MCP)
- **JWT session token** — captured from a logged-in browser session. HS256, payload `{iss:"TMS", sub:"<user_uuid>", iat, nbf, id_session_re_validate:0}`. Short-lived. Same `Authorization: Bearer` header works. Useful for local dev when generating an API key is inconvenient.

### Still unclear (measure during Phase 1)
- Rate limit window: 10 requests per **what** (second/minute/hour)?
- Whether API keys are scoped or full-access. Postman doc doesn't mention scopes — assume full until proven otherwise.
- Whether the same API key works against `app.testsigma.com` automation platform (not needed for this MCP).

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
| **Filter params** | Django-ORM-like suffix syntax: `?name__NEQ=Demo`, presumably `__EQ`, `__LIKE`, `__IN`, etc. (full operator list not documented). On test_cases also: `?folder_id=<uuid>`, `?search=<term>`. |
| **Pagination params** | `?page_size=<n>` confirmed in Postman doc. Cursor via `page_info.next` |
| **Multipart endpoints** | Two confirmed: (1) Update run TC result — JSON payload in `data` field + files as `attachments_<i>_<j>`. (2) JUnit import — file as `junit_xml`. |
| **Error envelope (404)** | `{"code":404,"message":"Not Found"}` — 35 bytes flat |
| **Error envelope (validation)** | `{"message":"<msg>","errors":{"code":400,"message":"<msg>","details":"<detail>"}}` |
| **Error envelope (not-found-with-id)** | `{"message":"<entity> not found","errors":{"code":404,"message":"...","details":"<entity> not found with ID: <uuid>"}}` |
| **Request ID** | `x-request-id: <uuid>` on every response — quote in support tickets |
| **Rate limit** | Headers `x-tms-api-limit: 10`, `x-tms-api-remaining: <n>`, `x-tms-api-reset: <negative>`. Window unit unknown. |
| **CORS** | OPTIONS auth-gated. Server-to-server only. |
| **Swagger / OpenAPI** | NOT exposed (`/swagger.json`, `/openapi.json`, `/api-docs` all 404 even with valid JWT). |
| **GraphQL** | `POST /graphql` returns 404 (the unauthenticated 401 was misleading — auth gate fires before route resolution). REST is the only API. |

### Source of truth for endpoints
Official Testsigma Postman collection (2025-06-24 publish): https://documenter.getpostman.com/view/40565679/2sB2xChp9y

A sanitized JSON snapshot is cached at `tmp/pm.json` during Phase 0 — not committed (gitignored). Re-fetch with:
```bash
curl -sS "https://documenter.getpostman.com/api/collections/40565679/2sB2xChp9y" > /tmp/pm.json
```

The Postman doc covers 44 endpoints across 7 groups: Project, Folder, Test Case, Step Group, Test Run, Test Plan, Settings. **Conspicuously absent**: requirements/Jira-link, custom fields, attachments-per-TC. These are not exposed in the official public API.

---

## 5. Endpoints Reference

All endpoints are under base `https://test-management.testsigma.com/api/v1`. Auth: `Authorization: Bearer <key>`. Status: [x] = documented in Postman doc + observed body shape captured, [~] = documented but body not yet observed (empty in our account).

### Projects
| Method | Path | Notes |
|---|---|---|
| GET | `/projects` | List. Supports filter operators: `?name__NEQ=Demo project`, `?page_size=N`. Response: `data.projects[]` |
| GET | `/projects/{id}` | Detail. Response: `data.project` |
| POST | `/projects` | Create. Body: `{name, description, human_id_prefix}` |
| PUT | `/projects/{id}` | Update. Body: `{name?, description?}` |
| DELETE | `/projects/{id}` | Delete |

### Folders
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{pid}/folders` | List. `?page_size=N`. Response: `data.folders[]`. `children` is always `[]` in list response — build tree from `parent_folder_id`. |
| GET | `/projects/{pid}/folders/{fid}` | Detail. Response: `data.folder` |
| POST | `/projects/{pid}/folders` | Create. Body: `{name, order}`. Parent assignment via separate `/move` call (or `parent_folder_id` in body — TBD; Postman example doesn't show parent at create time). |
| PUT | `/projects/{pid}/folders/{fid}` | Update. Body: `{name?, order?}` |
| POST | `/projects/{pid}/folders/{fid}/move` | Reparent. Body: `{parent_folder_id}` |
| DELETE | `/projects/{pid}/folders/{fid}` | Delete |

### Test Cases
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{pid}/test_cases` | List. Filters: `?folder_id=<uuid>`, `?search=<term>`. Cursor pagination via `page_info.next`. Response: `data.test_cases[]` |
| GET | `/projects/{pid}/test_cases/{tc_id_or_human_id}` | Detail. Response: `data.test_case`. URL accepts UUID OR `human_id` like `DEMO-2`. |
| POST | `/projects/{pid}/test_cases` | Create. See body schema below. |
| PUT | `/projects/{pid}/test_cases/{tc_id_or_human_id}` | Update. Same body. To switch template, change `template_type` and add/remove `individual_steps`. |
| DELETE | `/projects/{pid}/test_cases/{tc_id_or_human_id}` | Delete |

**Create/Update body schema:**
```jsonc
{
  "title": "<string>",
  "description": "<string>",
  "template_type": "TCD" | "STEPS",     // TCD = string blob, STEPS = individual_steps array
  "preconditions": "<string>",
  "steps": "<string>",                  // newline-delimited if TCD
  "expected_results": "<string>",       // newline-delimited if TCD
  "type_id": "<uuid>",                  // from /test_cases/types
  "status_id": "<uuid>",                // from /test_cases/statuses
  "automation_type_id": "<uuid>",       // from /test_cases/automation_types
  "priority_id": "<uuid>",              // from /test_cases/priorities
  "project_id": "<uuid>",
  "owner_id": "<uuid>",                 // from /users
  "reviewer_id": "<uuid>",
  "folder_id": "<uuid>",
  "label_ids": ["<uuid_or_name>"],      // ambiguous — Postman example uses string name, not UUID
  "individual_steps": [                 // only when template_type === "STEPS"
    {
      "step_description": "<string>",
      "expected_results": "<string>",
      "order": <float>,
      "step_type": "DEFAULT",           // possibly STEP_GROUP, others TBD
      "step_group_id": null             // UUID when reusing a step_group
    }
  ]
}
```

### Step Groups (reusable step bundles)
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{pid}/step_groups` | List. `?page_size=N`. |
| GET | `/projects/{pid}/step_groups/{sg_id_or_human_id}` | Detail. Human ID format: `DEMO-SG-1`. |
| POST | `/projects/{pid}/step_groups` | Create. Body: `{title, description, label_ids[], steps: [{step_description, expected_result, order}]}`. NOTE: field is `expected_result` (singular) here, but `expected_results` (plural) in test_case `individual_steps` — schema inconsistency. |
| PUT | `/projects/{pid}/step_groups/{sg_id_or_human_id}` | Update. Same body. |
| DELETE | `/projects/{pid}/step_groups/{sg_id_or_human_id}` | Delete |

### Test Plans
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{pid}/test_plans` | List |
| GET | `/projects/{pid}/test_plans/{plan_id_or_human_id}` | Detail. Human ID: `DEMO-P-1` |
| POST | `/projects/{pid}/test_plans` | Create. Body: `{title, description, start_date, end_date, label_ids[]}` (dates are epoch seconds based on example — 1710374400 = 2024-03-14) |
| PUT | `/projects/{pid}/test_plans/{plan_id_or_human_id}` | Update |
| DELETE | `/projects/{pid}/test_plans/{plan_id_or_human_id}` | Delete |
| POST | `/projects/{pid}/test_plans/{plan_id}/complete` | Mark plan completed (no body) |
| GET | `/projects/{pid}/test_plans/{plan_id}/test_runs` | List runs belonging to this plan |

### Test Runs
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/{pid}/test_runs` | List. Response: `data.test_runs[]` |
| GET | `/projects/{pid}/test_runs/{run_id_or_human_id}` | Detail. Human ID: `DEMO-R-1` |
| POST | `/projects/{pid}/test_runs` | Create. See body below. |
| PUT | `/projects/{pid}/test_runs/{run_id_or_human_id}` | Update |
| DELETE | `/projects/{pid}/test_runs/{run_id_or_human_id}` | Delete |
| GET | `/projects/{pid}/test_runs/{run_id_or_human_id}/test_cases` | List per-TC results. Response: `data.test_run_cases[]` |
| **PUT** | `/projects/{pid}/test_runs/{run_id_or_human_id}/test_cases` | **Update result(s) — multipart/form-data.** See body below. |
| PUT | `/projects/{pid}/test_runs/{run_id_or_human_id}/assign_user` | Assign user. Body: `{user_id, test_case_id}` |
| POST | `/projects/{pid}/junit-import/test-run/{run_id_or_human_id}` | JUnit import. multipart with `junit_xml` file. Async. |
| GET | `/projects/{pid}/junit-imports/{import_id}/status` | Poll import status |

**Create test run body:**
```jsonc
{
  "title": "<string>",
  "description": "<string>",
  "status": "ACTIVE",
  "project_id": "<uuid>",
  "human_id": "<optional>",
  "selection_type": "STATIC" | "DYNAMIC",
  "static_selection_filters": [           // for STATIC
    { "field": "id", "operator": "IN", "values": ["<tc_uuid>"] }
  ],
  "dynamic_selection_filters": [],        // for DYNAMIC
  "start_date": <epoch_seconds>,
  "end_date": <epoch_seconds>,
  "assignee_id": "<uuid>",
  "label_names": ["Smoke", "Regression"],  // note: label_names here, label_ids elsewhere
  "environment_ids": []
}
```

**Update run TC result body (multipart/form-data):**
- Form field `data` (text): `{"test_run_cases": [{"test_case_id":"<uuid>","test_run_status_id":"<uuid>","user_id":"<uuid>","description":"<string>"}]}`
- Form fields `attachments_<run_case_index>_<attachment_index>` (file): optional file attachments

### Settings / Lookup tables (root-level, no project scope)
| Method | Path | Returns |
|---|---|---|
| GET | `/test_cases/statuses` | TC lifecycle status options (Draft/Active/etc) |
| GET | `/test_cases/priorities` | Priority options (High/Medium/Low/etc) |
| GET | `/test_cases/types` | TC type options (Functional/Regression/etc) |
| GET | `/test_cases/automation_types` | Automation status options |
| GET | `/test_runs/statuses` | Run-result status options (Passed/Failed/Blocked/Skipped) |
| GET | `/users` | All users in the org. Per-item: `{id, email, first_name, last_name, identity_user_uuid, status, ...}` |

**Note:** No CRUD endpoints in the public API for these lookup tables — they're managed via UI Settings → Manage Properties. MCP can only read, not customize.

### Labels (global, not in Postman doc but confirmed via probe)
- `GET /labels` — list. Response: `data.labels[]`. Per-item: `{id, name, createdAt, updatedAt}` (camelCase fields, inconsistent with elsewhere). Confirmed via direct probe; absent from Postman doc.

### Conspicuously absent (not exposed in API)
- ❌ **Requirements / Jira link** — Postman doc has zero endpoints. **Dropped from MCP MVP.**
- ❌ **Custom Fields** — referenced in §2 but no CRUD endpoint
- ❌ **Test Suites** — confirmed not a first-class resource (use run `selection_type` instead)
- ❌ **TC Attachments** — only attachable inside run results, not on the TC itself
- ❌ **Comments / History** — no endpoints
- ❌ **Current user / whoami** — workaround: decode JWT `sub` and cross-reference `/users[].identity_user_uuid`

---

## 6. Native Integrations (Relevant ke MCP)

### Jira (two-way) — partial
- Native UI feature: "Requirements" field on test case stores Jira issue keys, two-way sync, failure auto-creates Jira issues.
- **However: NOT exposed in the public REST API.** Postman collection has zero Jira-link endpoints. Confirmed dropped from MCP MVP scope.
- **MCP value remaining:** orchestration only. Atlassian MCP fetches Jira issue → user manually pastes Jira key into TMS UI Requirements field. Or scaffold a TC from Jira issue content without the formal link.

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
| 1 | API key TMS = automation key, atau terpisah? Apakah ada API key panel? | ✅ **Closed** — TMS Settings has API Keys panel (user-confirmed). Both API key + JWT session token work with `Authorization: Bearer`. | Critical | — |
| 2 | API base URL exact path? | ✅ **Closed** — `/api/v1/` on `test-management.testsigma.com` | Critical | — |
| 3 | Endpoints + body shapes for all resources? | ✅ **Closed** — Official Postman collection covers full CRUD for Project, Folder, Test Case, Step Group, Test Run, Test Plan; plus 5 Settings lookup endpoints | High | — |
| 4 | Pagination style? | ✅ **Closed** — cursor-based, base64-encoded JSON. Param: `?page_size=N`. Returns `page_info: {page_size, total_count, next, prev}` | Medium | — |
| 5 | Rate limits? | ✅ **Closed (2026-05-19)** — measured empirically during Phase 1 E2E: ~10 req/sec hard cap. Burst of 5 parallel lookup fetches combined with prior in-flight calls returns HTTP 500 with body `{"message": "rate limit exceeded"}` (NOT the standard 429). Client should sequentialize bulk operations or add small delay. | Medium | — |
| 6 | Steps schema? | ✅ **Closed** — two template types. `TCD` = single string. `STEPS` = `individual_steps[]` structured. | High | — |
| 7 | Lookup tables for status/priority/type? | ✅ **Closed** — root-level endpoints under `/test_cases/{statuses,priorities,types,automation_types}` and `/test_runs/statuses` | High | — |
| 8 | Test Suites? | ✅ **Closed** — not a first-class API resource. Use test run `selection_type` instead. | Medium | — |
| 9 | Jira link API? | ✅ **Closed (negative)** — not exposed. Dropped from MVP. | Medium | — |
| 10 | `label_ids` vs `label_names` inconsistency? | Open | Low | First write test will reveal — Postman example for create_test_case uses string name (`"Flight_testcase"`) inside `label_ids`. Could be auto-create-by-name. |
| 11 | `step_type` enum complete values? | Open | Low | Capture during a UI action that adds a step group reference inside a TC |
| 12 | JWT vs API key lifetime difference? | Open | Medium | Generate API key in TMS UI, observe behavior over days |
| 13 | Rate limit reset header semantics (negative number)? | Open | Low | Acknowledge as undocumented; ignore in client |
| 14 | Step attachment upload flow? | Open (skip MVP) | Low | Defer; tools tanpa attachment dulu |
| 15 | Custom field schema discovery? | Open | Low | Inspect per-project payload jika nanti muncul `custom_fields` field |
| 16 | Webhook / event API? | Open | Low | Defer to future roadmap |
| 17 | Multi-tenant: workspace concept? | Open | Low | Belum kelihatan di endpoint manapun — likely tenant = subdomain |

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
| 2026-05-19 | Phase 0 ✅ complete. Ingested official Testsigma Postman collection (https://documenter.getpostman.com/view/40565679/2sB2xChp9y). Closed Q1 (API keys panel exists), Q3, Q6, Q7, Q8 (suites not in API), Q9 (Jira not in API). Discovered Step Groups as new entity, TCD vs STEPS template duality, root-level lookup endpoints, multipart pattern for run result + JUnit import, folder `/move` action, plan `/complete` action, `__operator` filter syntax. Requirements/Jira API dropped from MVP per user decision. | Claude (using Postman doc shared by Rizqi) |
