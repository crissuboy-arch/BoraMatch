# Deployment runbook

Status: local MVP preparation. No production deployment or live billing approval is asserted.

## Prerequisites

Use Node 22 (22.19+ recommended) and npm, a committed lockfile, a Supabase test project, and Stripe test-mode credentials. Copy .env.example to .env.local and fill values locally; never commit credentials.

| Variable                             | Boundary / purpose                                          |
| ------------------------------------ | ----------------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Browser-visible project URL                                 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser-visible publishable key; RLS still required         |
| SUPABASE_SERVICE_ROLE_KEY            | Server-only privileged RPC client                           |
| APP_URL                              | Canonical application origin, http://127.0.0.1:3000 locally |
| STRIPE_SECRET_KEY                    | Server only; sk_test_ values exclusively                    |
| STRIPE_WEBHOOK_SECRET                | Server only; webhook signature secret                       |

Apply the repository's Supabase migrations in order to the test project using the database owner's instructions in database.md. Configure Auth site URL and allowed redirect URLs for the selected APP_URL. Enable the Before User Created Database hook public.before_user_created before allowing signup; registration metadata must provide dob as YYYY-MM-DD. Seed/review plan rows and set actual test-mode Stripe price IDs; do not invent payable prices or trust client-submitted amounts.

## Verification

Run npm ci, npm run lint, npm run typecheck, npm test, npm run build, npx playwright install chromium, then npx playwright test. npm test runs Vitest followed by the PGlite Node test suite; npm run test:unit and npm run test:db run each separately. CI installs Chromium with OS dependencies and starts the production build through Playwright.

Configure the Stripe webhook endpoint implemented in src/app/api and select only supported events. Forward test events with the matching endpoint signing secret. Verify accepted signatures, rejected invalid signatures, duplicate-event handling, and durable state via apply_billing_event. Never expose the service key to the frontend.

## Release gate

Require passing CI plus hosted test-project checks for signup, callback, signout, cross-user RLS isolation, checkout, webhook retries and subscription updates. Review actual migration/RPC grants, monitoring, backup/restore, abuse controls, privacy/retention and legal text before any public release. Legal drafts are not approved policies.

Record deployment URL, commit, migration version, environment and test evidence in audit.md. Keep rollback artifacts; restore application version only after checking schema compatibility. Pause test checkout on billing inconsistency and investigate durable events before replaying.

## Local browser fallback

If downloading Chromium is restricted and Microsoft Edge is already installed, PowerShell can run the same Chromium-engine checks with:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npx playwright test
```

CI uses Playwright's bundled Chromium by default. Record the browser actually used; Edge emulation is not physical-device or Safari verification.

## Retention worker

The repository includes scripts/retention.mjs. In a trusted environment with .env.local configured, run:

```powershell
node --env-file=.env.local scripts/retention.mjs
```

The worker processes durable test-billing cancellation requests first, then SQL purging, queued private-photo deletion, Auth account deletion and retention cleanup. Queue acknowledgements follow successful external operations; failures remain for retry. Inspect database.md for retention intervals and queue contracts.

No scheduler or cron is configured by this repository work, and no credentialed worker run is claimed. An operator must schedule it with server-only credentials, monitor failures, verify cancellation and deletion in a test project, and approve retention/legal-hold policy before release.

## Vercel preview setup (not performed)

After GitHub authentication is repaired and feat/boramatch-mvp is pushed:

1. Prepare a GitHub import of crissuboy-arch/BoraMatch using the repository root, Next.js preset, Node 22, npm ci and npm run build. Important: Vercel documents the first deployment of every new project as Production, even from another branch. Stop before that first deployment unless an owner separately approves a protected initial setup. For a project with that initial setup already established, keep main as the production branch and deploy feat/boramatch-mvp to Preview; never promote this MVP to production as part of this runbook.
2. Set all six variables from the table above for Preview, using a dedicated Supabase test project and Stripe test-mode secrets. Set APP_URL to the exact stable preview origin, with no path or trailing slash. Public Supabase variables are embedded at build time, so redeploy after changing them. Restrict preview access to the review team.
3. In Supabase Auth, set the test project's site URL and allow the exact preview /auth/callback redirect URL. Verify the callback/recovery flow to /recuperar, require email confirmation and enable public.before_user_created before signup. Keep local callback URLs only where needed.
4. In Stripe test mode, register https://<preview-host>/api/stripe/webhook as an event destination. Select the subscription events handled by the source (customer.subscription.created, customer.subscription.updated, customer.subscription.deleted). Put this destination's whsec_ signing secret in STRIPE_WEBHOOK_SECRET and redeploy. Configure the plan table with matching test price IDs and review amount/currency agreement.
5. Verify that preview protection permits Stripe's webhook requests through an explicitly reviewed mechanism. Never assume an authenticated browser preview proves external webhook delivery. Run hosted signup/recovery, cross-user RLS/Storage, test checkout, signed webhook retries, cancellation and retention tests. Record actual evidence before any release decision.

No Vercel project, preview, domain, webhook registration or credentialed deployment was created by this work. GitHub publication remains authentication-blocked.

### Upload host limit

The local upload handler permits up to 8 MiB input and sanitizes it on the server. Vercel Functions have a 4.5 MB request-body limit, including multipart overhead, so larger permitted local files may be rejected before the handler runs. Before using that host publicly, enforce a conservative upload cap below the platform limit in both UI/server, or implement an approved staging pipeline that still sanitizes photos before private publication. Verify real multipart uploads and failure messages on the selected host; the current local test suite does not establish Vercel upload compatibility.

Official references: [Git deployments](https://vercel.com/docs/git), [preview environments](https://vercel.com/docs/deployments/environments), [function limits](https://vercel.com/docs/functions/limitations). Reviewed 2026-10-17.

### Browser runner lifecycle

Playwright starts Next.js directly for a bounded test run, explicitly sets APP_URL=http://127.0.0.1:3000 and refuses to reuse an unrelated server. This avoids inherited-origin configuration and npm child-process teardown issues on Windows. A successful test run does not mean a persistent preview server remains available.
