# Roadmap

## MVP acceptance

- Complete public responsive pages and keyboard-accessible navigation.
- Run lint, typecheck, unit/database tests, production build and desktop/mobile Playwright.
- Validate actual Supabase SSR login/callback/logout and cross-user RLS in a hosted test project.
- Configure plans and Stripe test price IDs; verify signed webhook delivery, retry deduplication and billing RPC authorization.
- Publish the development branch and open the already-authorized pull request once GitHub authentication is restored. Merge remains manual; public launch and live payments require a future release decision.

## Pilot readiness

Review profile visibility, reporting/blocking, moderation, upload restrictions, age policy, account deletion, data retention and approved legal copy. Add operational monitoring, rate limiting and tested backup/restore. Exercise concurrency and out-of-order billing events against hosted Postgres.

## Later, explicitly gated

Evaluate matching quality, messaging safety and broader browser/device coverage from pilot evidence. Live payments and production rollout require a separate approved scope and engineering review; the current implementation permits test billing only.
