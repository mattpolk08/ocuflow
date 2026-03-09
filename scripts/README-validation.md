# OculoFlow D1 Migration Validation

## Quick-start

```bash
npm install   # installs better-sqlite3, tsx
```

### Export your D1 database locally
```bash
# Local dev database (persisted by wrangler dev --persist)
wrangler d1 export oculoflow-production --local --output ./oculoflow-local.sqlite

# Production database
wrangler d1 export oculoflow-production --remote --output ./oculoflow-prod.sqlite
```

### Run the validator

| Command | What it does |
|---------|-------------|
| `npm run validate:d1 -- --db ./oculoflow-local.sqlite` | SQL-only tests against local SQLite |
| `npm run validate:d1 -- --url http://localhost:3000` | HTTP smoke tests against wrangler dev |
| `npm run validate:d1 -- --db ./oculoflow-local.sqlite --url http://localhost:3000` | Both (recommended) |
| `npm run validate:d1:verbose -- --db ./oculoflow-local.sqlite` | Print every passing test |
| `npm run validate:d1:json -- --db ./oculoflow-local.sqlite > report.json` | Machine-readable output |

### Against production
```bash
npm run validate:d1 -- \
  --db ./oculoflow-prod.sqlite \
  --url https://oculoflow.workers.dev
```

---

## Test Suites

| Suite | Tests | Requires |
|-------|-------|---------|
| **Schema Integrity** | All 20+ tables exist; per-table column spot-checks; index verification | `--db` |
| **Seed Data Integrity** | org-001, providers, pt-001, sb-001, frm-001..003 present; status enum values | `--db` |
| **D1 Query Correctness** | Every D1 query path exercised (SELECT, INSERT round-trip, UPDATE, aggregate) | `--db` |
| **KV→D1 Parity** | Field presence & types match the old KV model; derived fields (frame status, totals) | `--db` |
| **HTTP Endpoint Smoke** | GET/POST/PATCH on /api/schedule, /api/patients, /api/billing, /api/optical + 401/404 checks | `--url` |
| **Performance Baselines** | 7 common queries each complete under threshold (30–100ms on SQLite) | `--db` |

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed (or only skips) |
| `1` | One or more tests failed |

---

## CI integration (GitHub Actions)

```yaml
# .github/workflows/validate-d1.yml
name: D1 Migration Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - name: Apply migrations to local D1
        run: |
          wrangler d1 migrations apply oculoflow-production --local
          wrangler d1 export oculoflow-production --local --output ./oculoflow-test.sqlite
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
      - name: Run validation
        run: npm run validate:d1:json -- --db ./oculoflow-test.sqlite > report.json
      - uses: actions/upload-artifact@v4
        with:
          name: d1-validation-report
          path: report.json
```
