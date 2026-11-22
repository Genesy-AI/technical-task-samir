# TinyEnginy: Improvements & Technical Roadmap

| | |
|---|---|
| **Status** | Proposal, ready for grooming |
| **Owner** | Engineering |
| **Last updated** | 2026-11-22 |
| **Scope** | Backend (Express, Prisma, Temporal), Frontend (React, React Query), tooling and delivery |

## TL;DR

The product works end to end for a single user on a laptop, but three things block treating it as production code: **no safety net** (no API input validation, no auth, no CI), **long-running work done inside HTTP requests**, and **everything in a few large files** (`index.ts`, `LeadsList.tsx`). The roadmap fixes correctness and safety first (**Now**), then reliability and scale (**Next**), then product polish and platform upgrades (**Later**).

---

## How items are prioritized

Each item gets a **priority** from impact and risk, and an **effort** estimate.

| Priority | Meaning |
|---|---|
| **P0** | Correctness, security or data-integrity risk, or it blocks the team from shipping safely. Do now. |
| **P1** | Reliability, scalability or developer-velocity gain with clear payoff. Do next. |
| **P2** | Product and UX improvements, or structural work that becomes urgent as the team grows. |
| **P3** | Nice to have; pick up opportunistically. |

| Effort | Rough size |
|---|---|
| **S** | ≤ 1 day |
| **M** | 2–4 days |
| **L** | 1–2 weeks |

Within a priority level, **cheap items that unblock others go first**.

---

## Roadmap at a glance

| Phase | ID | Item | Priority | Effort |
|---|---|---|---|---|
| **In flight** | IMP-00 | Land open branches in the right order | P0 | S |
| **Now** (Sprint 1) | IMP-01 | Validate input at the API boundary | P0 | M |
| | IMP-02 | Fix the broken lead update contract | P0 | S |
| | IMP-03 | Stop tracking `dev.db` and `.env` in git | P0 | S |
| | IMP-04 | CI pipeline + fix the ESLint setup | P0 | S |
| | IMP-05 | Central config and secrets handling | P0 | S |
| | IMP-06 | Authentication, CORS and rate limiting | P0 | M |
| **Next** (Sprints 2–3) | IMP-07 | One async-job pattern for all long-running work | P1 | M |
| | IMP-08 | Split the backend into routes, services and data access | P1 | M |
| | IMP-09 | Pagination, sorting and indexes for leads | P1 | M |
| | IMP-10 | Fast, transactional bulk import with better dedupe | P1 | M |
| | IMP-11 | Shared API contract between frontend and backend | P1 | M |
| | IMP-12 | Test coverage for API, workflows and UI | P1 | M |
| | IMP-13 | Logging, error tracking and metrics | P1 | M |
| | IMP-14 | Provider rate limiting and configurability | P1 | M |
| | IMP-15 | Break up large frontend components | P2 | M |
| **Backlog** | IMP-16 | Accessibility pass | P3 | M |
| | IMP-17 | One-command local setup | P3 | S |
| | IMP-18 | Automated dependency updates | P3 | S |

---

## In flight

### IMP-00: Land open branches in the right order · P0 · S
**Problem:** Several feature and fix branches are open at once, and some depend on each other. `feature/enrich-phone` is stacked on `feature/add-lead-fields`, and both add migrations. Merging out of order causes migration conflicts and confusing diffs.

**Proposal:** Merge in this order:
1. `bug/fix-email-verification-hanging`
2. `bug/fix-csv-country-codes`
3. `feature/add-lead-fields`
4. `feature/enrich-phone` (retarget to `main` after step 3)
5. Review `feature/implement-gender-guessing` separately.
6. Merge the open Dependabot PRs (`vite`, `follow-redirects`) after CI exists (IMP-04).

**Impact:** Unblocks everything else and avoids migration drift between environments.

---

## Now: correctness, safety and delivery basics

### IMP-01: Validate input at the API boundary · P0 · M
**Problem:**
- The API trusts its input. `PATCH /leads/:id` writes the literal string `"undefined"` when a field isn't sent (`String(name)`).
- `POST /leads/bulk` accepts any `countryCode`, phone or URL the client sends.
- Validation rules live only in the frontend CSV parser, so any other client bypasses them.

**Proposal:**
- Add a schema library (e.g. **zod**) and one validation middleware.
- Define a `LeadInput` schema once and reuse it for create, update and bulk import.
- Return `400` with field-level errors.

**Impact:** Prevents corrupt data, the most expensive class of bug to clean up later. **Depends on:** nothing.

### IMP-02: Fix the broken lead update contract · P0 · S
**Problem:**
- The frontend API client calls `PUT /leads/:id`, but the backend only defines `PATCH`, so updates fail silently.
- The backend also overwrites `firstName` and `email` with `"undefined"` when they're missing.

**Proposal:** Use `PATCH` with true partial updates (only fields that are sent), validated by IMP-01. Add an integration test.

**Impact:** Prerequisite for any edit UI (IMP-16).

### IMP-03: Stop tracking `dev.db` and `.env` in git · P0 · S
**Problem:**
- `backend/prisma/dev.db` is committed, so every branch shows it as modified and it causes merge conflicts.
- `frontend/.env` is committed. It's harmless today but sets a pattern for leaking real secrets.

**Proposal:**
- Remove both from the index and add them to `.gitignore`.
- Add a `.env.example` for the frontend.
- Add a `prisma db seed` script with the demo leads, so a fresh clone still works.

### IMP-04: CI pipeline + fix the ESLint setup · P0 · S
**Problem:**
- There's no CI; nothing runs typecheck or tests on PRs.
- `pnpm lint` in the frontend is broken: ESLint 9 is installed, but the config is the legacy `.eslintrc.cjs`.
- The backend has no lint at all.

**Proposal:**
- Add a GitHub Actions workflow that runs install, `tsc`, lint, `vitest` and a migration drift check (`prisma migrate diff`) for both packages.
- Migrate to `eslint.config.js` and add backend linting.
- Make the checks required for merge.

**Impact:** Highest leverage for the cost. Every later item is safer to ship with it.

### IMP-05: Central config and secrets handling · P0 · S
**Problem:**
- The Temporal address (`localhost:7233`), task queue (`myQueue`) and port are hard-coded in several places.
- Provider API keys have fallbacks in code.

**Proposal:**
- Add a single `config.ts` that loads and validates environment variables at startup (fail fast if one is missing).
- Remove the in-code key fallbacks.
- Document every variable in `.env.sample`.

### IMP-06: Authentication, CORS and rate limiting · P0 · M
**Problem:**
- The API is fully open: there's no auth, and CORS is `*`.
- Any caller can delete all leads or spend provider credits by triggering enrichment.

**Proposal:**
- Add session or JWT auth with a `userId` / `workspaceId` on leads (multi-tenant ready).
- Restrict CORS to the frontend origin.
- Rate-limit expensive endpoints (`/enrich-phone`, `/verify-emails`, `/bulk`).

**Note:** P0 before any non-local deployment. If the app stays local-only for now, schedule it right after IMP-04.

---

## Next: reliability, scale and velocity

### IMP-07: One async-job pattern for all long-running work · P1 · M
**Problem:** Long-running work is handled three different ways:
- Email verification blocks the HTTP request until every Temporal workflow finishes.
- Phone enrichment starts the workflow and has the UI poll a status column.
- Message generation runs synchronously, one lead at a time.

On top of that, a new Temporal connection is opened on every request, and the worker runs inside the API process, so a slow job slows the API.

**Proposal:**
- **One pattern:** the endpoint starts the workflow(s) and returns `202`; the workflow saves its status and result; the UI polls (or later uses server-sent events) while anything is pending.
- **Shared Temporal client:** one client instance for the whole API.
- **Separate worker:** run the worker as its own process (`pnpm worker`) so it can be scaled and deployed independently.

**Impact:** Predictable UX, no request timeouts, and the worker can scale on its own.

### IMP-08: Split the backend into routes, services and data access · P1 · M
**Problem:** `backend/src/index.ts` (~320 lines) mixes routing, validation, business logic, Prisma calls and Temporal calls. Every feature edits the same file, so conflicts and regressions are likely.

**Proposal:**
- **Structure:** `routes/leads.ts`, then `services/leadService.ts`, then `repositories/leadRepository.ts`.
- **Errors:** one error-handling middleware instead of a try/catch with `console.error` in every handler.
- **Rollout:** move code incrementally, one route per PR, without behaviour changes.

### IMP-09: Pagination, sorting and indexes for leads · P1 · M
**Problem:** `GET /leads` returns the whole table, and the UI renders every row. That doesn't scale past a few thousand leads, and "select all" selects everything at once.

**Proposal:**
- **API:** cursor pagination plus server-side sort and filter on `GET /leads`.
- **Database:** indexes on `email` and `createdAt`.
- **UI:** a paginated or virtualized table, and an explicit "select all N matching" action.

### IMP-10: Fast, transactional bulk import with better dedupe · P1 · M
**Problem:**
- Import inserts one row at a time with no transaction, so a crash mid-import leaves a partial import.
- Duplicates are detected by first name + last name only. Two different "John Smith"s collide, and the same person under another spelling is imported twice.

**Proposal:**
- Use `createMany` inside a transaction.
- Dedupe on normalized email, with name as a secondary signal.
- Re-validate on the server with the IMP-01 schema.
- Return per-row results so the preview and the final outcome match.

### IMP-11: Shared API contract between frontend and backend · P1 · M
**Problem:**
- Request and response types are hand-written twice, and they already disagree: `getOne` is missing fields, and update uses the wrong HTTP method.
- The list of template fields is duplicated between `messageGenerator` and the composer.

**Proposal:**
- Generate frontend types from the backend zod schemas (shared package or OpenAPI).
- Expose `GET /template-fields` so the composer reads the backend's list instead of hard-coding it.

### IMP-12: Test coverage for API, workflows and UI · P1 · M
**Problem:** Only pure utilities are tested (`csvParser`, `messageGenerator`, the provider adapters). Endpoints, Temporal workflows and UI flows have no tests.

**Proposal:**
- **API:** integration tests with `supertest` against a temporary SQLite database.
- **Workflows:** tests with `@temporalio/testing` (time-skipping, mocked activities) covering provider fallback, retries and the one-workflow-per-lead rule.
- **UI:** component tests for import, verify and enrich, with React Testing Library and MSW.

### IMP-13: Logging, error tracking and metrics · P1 · M
**Problem:** Errors only reach `console.error`, and nobody can tell how often providers fail or how long enrichment takes.

**Proposal:**
- **Logs:** structured logging (pino) with request IDs.
- **Errors:** Sentry on the frontend and backend.
- **Metrics:** Temporal SDK metrics, plus provider success, latency and cost counters.
- **Alerts:** a dashboard and an alert on provider error rate.

### IMP-14: Provider rate limiting and configurability · P1 · M
**Problem:** The providers have announced rate limits. Today the only protection is retrying 429s with backoff, which still bursts.

**Proposal:**
- **Rate limits:** a separate task queue per provider, using `maxTaskQueueActivitiesPerSecond` to enforce each limit across all workers.
- **Configuration:** move provider order, timeouts and enabled flags into config, so they can change without a deploy.
- **Cost tracking:** record which provider found each phone.

### IMP-15: Break up large frontend components · P2 · M
**Problem:**
- `LeadsList.tsx`, `CsvImportModal.tsx` and `MessageTemplateModal.tsx` are each 300+ lines, with inline SVGs and duplicated modal logic (escape key, backdrop, scroll lock).
- A heavily typed `useApiMutation` layer exists but is used only for an unused `create`.

**Proposal:**
- Extract a shared `Modal`, `Dropdown`, `Spinner`, `StatusBadge` and an icon set (`@tabler/icons-react` is already installed).
- Move mutations into hooks (`useVerifyEmails`, `useEnrichPhone`, …).
- Either adopt `useApiMutation` everywhere or delete it.

---

## Backlog

- **IMP-16: Accessibility pass (P3 · M).** Keyboard navigation for the Enrich dropdown, focus trap and `aria-modal` in modals, labelled checkboxes, a colour-contrast check.
- **IMP-17: One-command local setup (P3 · S).** A pnpm workspace at the root, `docker-compose` for Temporal (and Postgres later), and `pnpm dev` to start everything.
- **IMP-18: Automated dependency updates (P3 · S).** Dependabot PRs are already appearing. Group them and auto-merge patch updates once CI (IMP-04) is green.

---

## Risks & open questions

- **Multi-tenancy (IMP-06):** do leads belong to a user, a team or a workspace? This decides the schema before Postgres.
- **Provider contracts:** the live Nimbus API differs from its documentation (`phoneNmbr` instead of `number`). Should we get a sandbox or a versioned API before going to production?
- **Enrichment cost:** should phone enrichment ask for confirmation above N leads, or have a credit budget?
- **Real-time updates:** polling is fine now. Should server-sent events come in with IMP-07, or wait for a real need?

## How we'll know it worked

- **CI:** every PR runs CI, and `main` stays green.
- **Data quality:** zero rows with `"undefined"` or invalid country codes.
- **API speed:** p95 API latency under 300 ms. No endpoint waits on an external provider.
- **Enrichment:** phone enrichment success rate and per-provider cost are visible on a dashboard.
