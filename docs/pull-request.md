# Suggested title

feat: implement BoraMatch relationship-platform MVP

# Pull request body

Adds BoraMatch to the initially empty repository: an original Portuguese interface for Brazil–Portugal connections, authenticated profile onboarding, private photos, preference-based discovery, mutual matches, authorized realtime chat, reporting/moderation, configurable plans and Stripe test billing.

The database enforces personal-data RLS, protected RPC mutations, age eligibility, quotas, match membership, blocks, billing event deduplication and immutable historical prices. Photo uploads pass through server-side image sanitization; clients cannot upload originals directly to the published private bucket. Deferred account deletion uses durable billing/storage/Auth cleanup queues.

Includes versioned migrations, setup/security/deployment documentation, a test workflow and local evidence in `docs/evidence`. Hosted Supabase and external Stripe sandbox acceptance remain pending configuration. The age check uses self-declared birth dates; legal review and operational moderation/retention setup are required before release. Live Stripe keys are explicitly rejected.

Validation: ESLint, TypeScript, production build, 55 unit tests and 22 PostgreSQL integration scenarios (23 Node test results including the parent integration test). Consult `docs/audit.md` and the final browser report for desktop/mobile accessibility results and remaining limits.

No VitrinePro code was changed. No production deployment or live payment activation is included. Merge is manual.
