# Testsigma TMS — Consolidated Reference

> Single source of truth untuk semua fakta yang dipakai di `PROJECT_PLAN.md` dan implementasi. Update file ini saat ada penemuan baru (terutama dari Phase 0 API discovery). Plan dan code wajib konsisten dengan file ini.

**Last verified:** 2026-05-19
**Status:** Pre-implementation (Phase 0 belum dijalankan)

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

### Test Case Fields (confirmed from docs)

| Field | Type | Notes |
|---|---|---|
| Name | string | Required |
| Description | rich text | Optional |
| **Priority** | enum | Editable via Settings → Manage Properties (custom values allowed) |
| **Type** | enum | Functional, Regression, Smoke, etc. — customizable |
| **Status** | enum | Draft, Active, In Progress, Outdated (lifecycle) |
| **Labels** | string[] | Multi-select tags |
| **Automation Type** | enum | Manual / Automated status |
| **Owner** | user ref | Assignee |
| **Reviewer** | user ref | Reviewer assignment |
| **Requirements** | Jira issue keys | Native Jira link |
| **Attachments** | file[] | Files supporting the TC |
| **Pre-Requisite** | text | Setup needed before execution |
| **Custom Fields** | dict | Configurable per project |
| Steps | array | `{ action: string, expected: string, attachment?: file }` |

### Folders
- Hierarchical tree structure (folders + subfolders, unlimited nesting)
- Test cases live inside folders
- Folder = organizational unit; doesn't have execution semantics

### Test Suites
- Flat collection of test cases (a TC can belong to multiple suites)
- Used for grouping by feature/scenario for execution
- Has its own Pre-Requisite field

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

### Confirmed
- **Method:** Bearer Token (API Key as the bearer)
- **Generation flow:** Settings → API Keys → Generate new API Key → name + parallel execution limit → Generate
- **Header format:** `Authorization: Bearer <API_KEY>`
- Key is shown once; user must save it immediately

### ⚠️ Unknown (Phase 0 must confirm)
- Apakah API key TMS = API key automation platform (single key, shared) atau terpisah?
- Apakah TMS punya panel "API Keys" sendiri di `test-management.testsigma.com/settings`?
- Apakah API key scope-nya cover semua TMS resources (projects, test cases, plans) atau cuma untuk integration tertentu (CI/CD trigger only)?
- Apakah ada PAT (personal access token) sebagai alternatif?

**Fallback risk:** Kalau TMS UI hanya pakai session cookie (no API key), MCP stateless server gak bisa dibikin tanpa OAuth/PAT alternatif. Ini hard blocker.

---

## 4. REST API

### ⚠️ Status: Public API spec NOT FOUND
Public docs untuk TMS API tipis. Yang ditemukan:
- `https://app.testsigma.com/api/v1/projects` — ini **automation platform**, bukan TMS
- TMS-specific REST endpoints belum dikonfirmasi di docs publik
- Tidak ada Swagger/OpenAPI yang ter-publish

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

### Hipotesis (perlu diverifikasi)
- Base URL: `https://test-management.testsigma.com/api/v1/...` (mirror dari automation platform pattern)
- Resources kemungkinan plural snake_case atau camelCase: `/projects`, `/test_cases` atau `/testCases`
- ID-based: `/projects/{id}`, `/test_cases/{id}`

---

## 5. Endpoints Reference

> Diisi setelah Phase 0. Format konsisten untuk setiap entry.

### Template

```
### GET /resource
Auth: Bearer
Headers: Content-Type: application/json
Query:
  - param (required, type, desc)
Response 200:
  {
    "data": [...],
    "pagination": { ... }
  }
Errors: 401, 404, 429
```

### Projects
- [ ] `GET /projects` — list projects (TBD)
- [ ] `GET /projects/{id}` — project detail (TBD)

### Folders
- [ ] `GET /projects/{id}/folders` — folder tree (TBD)
- [ ] `POST /folders` — create folder (TBD)

### Test Cases
- [ ] `GET /test_cases` — list with filters (TBD)
- [ ] `GET /test_cases/{id}` — detail with steps (TBD)
- [ ] `POST /test_cases` — create (TBD)
- [ ] `PUT /test_cases/{id}` — update (TBD)
- [ ] `DELETE /test_cases/{id}` — delete (TBD)
- [ ] Search endpoint shape (TBD)

### Test Suites
- [ ] `GET /test_suites` (TBD)
- [ ] `POST /test_suites` (TBD)
- [ ] Add/remove TC to suite (TBD)

### Test Plans
- [ ] `GET /test_plans` (TBD)
- [ ] `POST /test_plans` (TBD)

### Test Runs
- [ ] `POST /test_runs` — start run (TBD)
- [ ] `PUT /test_runs/{id}/results/{tcId}` — update TC result (TBD)
- [ ] `GET /test_runs/{id}/summary` (TBD)

### Requirements (Jira link)
- [ ] Link TC ↔ Jira issue (TBD)
- [ ] List TC by requirement (TBD)

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

| # | Question | Impact | How to resolve |
|---|---|---|---|
| 1 | API key TMS = automation key, atau terpisah? | Critical | Phase 0: cek Settings → API Keys di UI TMS |
| 2 | API base URL exact path? | Critical | Phase 0: DevTools Network |
| 3 | API key scope penuh atau limited? | High | Phase 0: `curl` test semua resource |
| 4 | Pagination style? | Medium | Phase 0: inspect response shape |
| 5 | Rate limits? | Medium | Phase 0: cek docs / response headers (`X-RateLimit-*`) |
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
