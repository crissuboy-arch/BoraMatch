# BoraMatch

Independent Next.js + TypeScript MVP for intentional connections between Brazil and Portugal. The public interface is Portuguese. Fictional illustrated demo profiles are explicitly labelled; demo actions do not save real data.

**Status:** local development and verification. Supabase credentials, hosted integration checks and release review are required. Stripe accepts test-mode keys only. No production deployment, live payments, approved legal policies or published GitHub PR are claimed. See [audit](docs/audit.md) for actual evidence and remaining checks.

## Run locally

Use Node 22.19+ within Node 22 and npm. From this directory:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. Without Supabase configuration, evaluate the public page and select **Explorar demonstração**. Authentication and persisted actions require a configured backend; a demo is not an authenticated test account.

Set APP_URL to the exact origin used in the browser, e.g. http://127.0.0.1:3000. State-changing routes enforce Origin. Use the same origin for Supabase Auth site/redirect configuration.

## Configuration

| Variable                             | Use                                                               |
| ------------------------------------ | ----------------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Public Supabase project URL                                       |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser-safe publishable key; requires RLS                        |
| SUPABASE_SERVICE_ROLE_KEY            | Server only; never expose in public variables                     |
| APP_URL                              | Canonical app origin for auth/billing redirects and origin checks |
| STRIPE_SECRET_KEY                    | Server only, sk_test_ prefix exclusively                          |
| STRIPE_WEBHOOK_SECRET                | Server only, matching Stripe test endpoint signing secret         |

Keep real values in .env.local or host secret storage. .env.example deliberately contains no credentials.

Follow [database setup and RPC contract](docs/database.md). Apply all files in supabase/migrations in order to a test Supabase project. Local Supabase CLI needs Docker; it was unavailable during initial work. Before opening signup, enable the Database Before User Created hook public.before_user_created. Registration metadata supplies dob in YYYY-MM-DD format; the server and onboarding independently check age. DOB is self-declared, not verified identity. Configure email confirmation and callback URLs including /auth/callback. Recovery uses /recuperar.

## Plans and Stripe tests

Plan data is configurable in the database, including price_cents, currency, benefits and stripe_price_id. Seed prices are sample configuration, not approved commercial offers. Configure actual Stripe **test** price IDs for enabled paid plans. The browser cannot choose arbitrary amounts or grant subscriptions.

The webhook route is /api/stripe/webhook. It verifies the raw-body signature and calls service-only apply_billing_event. A checkout success redirect does not grant access. Configure the matching STRIPE_WEBHOOK_SECRET and exercise duplicate, stale and invalid-signature events against a test deployment.

Account deletion also needs trusted scheduled cleanup of billing cancellations, private photos, SQL retention and Auth accounts. The implementation is scripts/retention.mjs; run node --env-file=.env.local scripts/retention.mjs only in a trusted configured environment. No scheduler is configured and no credentialed execution is claimed. See database.md for queue and acknowledgement RPCs. Deploying the web app alone does not schedule that work.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

npm test runs Vitest unit tests and then real migration/authorization tests in PGlite using Node's test runner. Run npm run test:unit or npm run test:db separately when investigating a failure. PGlite fixtures are not a hosted Supabase or concurrency verification.

Playwright starts the production build on 127.0.0.1:3000, checks desktop Chromium and a Pixel 7 viewport, and scans public pages/forms plus light/dark landing and synthetic-dashboard views for selected WCAG A/AA rules. It also checks labels, semantic structure, overflow and the synthetic demo. Automated checks do not establish complete accessibility compliance.

On Windows with an existing Edge installation, set $env:PLAYWRIGHT_CHANNEL='msedge' before the browser command to use Edge. Otherwise Playwright uses its installed Chromium. An optional PLAYWRIGHT_BROWSERS_PATH selects a local browser cache. CI installs bundled Chromium with OS dependencies and runs npm ci → lint → typecheck → unit/database tests → build → Playwright.

## Documentation

- [Architecture and trust boundaries](docs/architecture.md)
- [Deployment and integration checklist](docs/deployment.md)
- [Database, RLS, RPCs and cleanup](docs/database.md)
- [Security review](docs/security.md)
- [Roadmap and release gates](docs/roadmap.md)
- [Audit, provenance and verification](docs/audit.md)

Public /privacidade, /termos and /seguranca pages are clearly marked development notices. They do not substitute for approved policies or operational support.

REA was researched through official documentation only. No REA installation or analysis ran; no reference application was supplied. The audit links sources and records Node/Windows compatibility limits.

## Repository handoff

The initial local baseline is 223d7ee. Upstream was empty at handoff; remote push was authentication-blocked. Consult audit.md for the latest verified state. Do not merge, launch publicly or enable real payments without a separate release review.
