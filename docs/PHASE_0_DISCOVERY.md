# Phase 0 — TMS API Discovery Playbook

> ✅ **Phase 0 COMPLETED 2026-05-19.** Discovery resolved by ingesting the official Testsigma Postman collection: https://documenter.getpostman.com/view/40565679/2sB2xChp9y — see [`REFERENCE.md` §5](./REFERENCE.md#5-endpoints-reference) for the full endpoint catalog.
>
> This playbook is retained for posterity (DevTools fallback if the Postman doc disappears) and for capturing the few remaining edge-case items in [`REFERENCE.md` §8](./REFERENCE.md#8-known-limitations--open-questions) #10-13 (label_ids semantics, step_type enum, rate limit window, JWT vs API key lifetime).

**Prerequisite:** Akun aktif di `test-management.testsigma.com` dengan role yang bisa generate API key (Admin atau Super Admin).

---

## What's already done (no auth required)

✅ Confirmed via unauthenticated probing — sudah masuk ke [`REFERENCE.md` §4](./REFERENCE.md#4-rest-api):
- Base URL `https://test-management.testsigma.com/api/v1/`
- Auth header name = `Authorization`
- Error envelope shape `{"code", "message"}`
- Only API version `v1` exists
- `/api/v1/swagger.json` ada tapi auth-gated — **prioritas #1 di Step 2 di bawah**
- `/api/v1/graphql` ada (mungkin GraphQL paralel REST)

## What you need to do

### Step 1 — Generate API key di TMS UI (5 menit)

1. Login ke https://test-management.testsigma.com/ui/dashboard
2. Buka **Settings → API Keys** (cek apakah panel ini ADA di TMS — kalau tidak ada, ini sinyal Open Question #1: TMS pakai automation key)
3. **Generate New Key**, beri nama `mcp-discovery`, tanpa limit parallel
4. Copy key (sekali tampil) → simpan di `.envrc` lokal (jangan commit!):
   ```bash
   export TMS_API_KEY='<paste-here>'
   ```

**Penting untuk Open Question #1:**
- Kalau panel "API Keys" tidak ada di `test-management.testsigma.com/settings`, coba pakai key yang sudah ada dari `app.testsigma.com` → jalankan probe di Step 2 → kalau response 200, artinya key di-share antara dua produk. Catat di REFERENCE §3.

---

### Step 2 — Jalankan probe script (10 menit)

```bash
chmod +x scripts/probe.sh
./scripts/probe.sh
```

Script ini akan:
1. Coba ambil `/api/v1/swagger.json` — kalau dapat 200, **kita selesai 70% Phase 0** (tinggal parse spec)
2. Ping endpoint utama: `/projects`, `/test_cases`, `/folders`, `/test_plans`, `/test_suites`, `/me`
3. Probe path-style variants (snake vs camel) untuk konfirmasi konvensi
4. Inspect response headers untuk pagination + rate limit hints
5. Simpan semua response ke `tmp/phase0/*.json` untuk inspeksi manual

**Kalau swagger.json dapat 200 → copy ke `docs/swagger.json` (gitignore), share isinya di sini, lewati Step 3-4.**

---

### Step 3 — Manual DevTools capture (45–60 menit) — kalau tidak ada Swagger

Buka Chrome DevTools → **Network** tab → filter `Fetch/XHR` → clear log → lakukan action satu per satu dan capture request. Untuk tiap action, copy as cURL → tempel di tabel.

#### Action checklist
| # | Action di UI | Tujuan capture | Status |
|---|---|---|---|
| 1 | Load dashboard | `GET projects` list | ☐ |
| 2 | Open project | `GET projects/{id}`, mungkin `GET projects/{id}/folders` | ☐ |
| 3 | Open folder | `GET test_cases?folder_id=...` (atau equivalent) | ☐ |
| 4 | Open test case detail | `GET test_cases/{id}` + steps endpoint | ☐ |
| 5 | Create test case (kosong) | `POST test_cases` — body shape | ☐ |
| 6 | Add 1 step | `POST` atau `PATCH` untuk steps | ☐ |
| 7 | Update name TC | `PUT/PATCH test_cases/{id}` | ☐ |
| 8 | Delete TC | `DELETE test_cases/{id}` | ☐ |
| 9 | Create folder | `POST folders` body shape | ☐ |
| 10 | Create test suite | `POST test_suites` + add TC ke suite | ☐ |
| 11 | Create test plan | `POST test_plans` | ☐ |
| 12 | Start run + mark TC Pass | `POST runs` + `PUT/PATCH` result | ☐ |
| 13 | Link TC ke Jira issue | Cara: di `Requirements` field — capture endpoint | ☐ |
| 14 | Search test cases | filter endpoint + query format | ☐ |

#### Untuk tiap capture, isi block ini

````md
#### Action: <e.g. List projects>
- **Method + path:** `GET /api/v1/projects`
- **Query/path params:** `page=1&per_page=20` (atau apapun yang muncul)
- **Request headers:**
  - `Authorization: Bearer ...`
  - `Content-Type: ...`
  - Custom: `...`
- **Request body:** (untuk POST/PUT) — paste sample JSON
- **Status:** 200
- **Response headers (relevant):**
  - `X-Total-Count: ...`
  - `Link: ...` (RFC 5988?)
  - `X-RateLimit-*: ...`
- **Response body shape (truncated):**
  ```json
  { "data": [...], "page": 1, "totalPages": 5 }
  ```
- **Notes:** snake_case? camelCase? wrapping envelope?
````

→ Tempel hasil ke [`REFERENCE.md` §5 Endpoints Reference](./REFERENCE.md#5-endpoints-reference) menggantikan template TBD.

---

### Step 4 — Exit criteria check

Phase 0 considered **DONE** kalau:

- [ ] **Q1** closed di REFERENCE §8 (API key TMS vs automation: same or separate?)
- [x] **Q2** closed (base URL = `/api/v1/`)
- [ ] **Q3** closed (key scope verified — minimal `GET projects` + `POST test_cases` works)
- [ ] **Q4** closed (pagination style documented)
- [ ] REFERENCE §5 minimal contains documented:
  - `GET /projects` + `GET /projects/{id}`
  - `GET projects/{id}/folders` (or equivalent)
  - `GET /test_cases` + `GET /test_cases/{id}` + `POST /test_cases`
- [ ] `curl` reproduces a 200 for at least `GET /projects` (paste working curl into REFERENCE for posterity)
- [ ] If swagger.json fetched: committed (sanitized) at `docs/swagger.json` and referenced

---

### Step 5 — Decision gate

Setelah Step 4 tercentang, decide:

| Outcome | Next action |
|---|---|
| ✅ Auth works, full CRUD reachable | Proceed ke Phase 1 — generate boilerplate MCP server |
| ⚠️ Auth works tapi key scope limited (cuma CI trigger / cuma GET) | Re-evaluate scope MVP — mungkin read-only only; cek dengan support apakah ada PAT |
| ❌ API key tidak ada / hanya session cookie | **Hard blocker.** Pivot ke browser-MCP atau wait sampai vendor expose PAT. Update PROJECT_PLAN risk register. |

---

## Quick-reference probe one-liners

Replace `$TMS_API_KEY` with your real key in shell (don't commit).

```bash
# Health check (no specific endpoint — projects is the simplest)
curl -i -H "Authorization: Bearer $TMS_API_KEY" \
  https://test-management.testsigma.com/api/v1/projects

# Fetch swagger if accessible — JACKPOT case
curl -i -H "Authorization: Bearer $TMS_API_KEY" \
  https://test-management.testsigma.com/api/v1/swagger.json \
  | tee tmp/phase0/swagger.json

# Inspect a single project (replace ID)
curl -i -H "Authorization: Bearer $TMS_API_KEY" \
  https://test-management.testsigma.com/api/v1/projects/1
```

---

## Security reminders during Phase 0

- ❌ Never paste API key into commits, screenshots, Slack, or this repo
- ❌ Never log full request body in scripts that you might paste publicly
- ✅ Add `tmp/`, `.env*`, `docs/swagger.json` to `.gitignore` before running probes
- ✅ If you accidentally commit a key: rotate it immediately in TMS UI
