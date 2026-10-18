# Security review

This is an engineering review checklist, not a security certification or legal approval.

## Trust boundaries

Only NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY may enter browser bundles. Keep SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in server-only modules and deployment secret storage. Never log secrets, access tokens, private messages or full webhook payloads.

Verify SSR identity at protected entry points; do not authorize from unverified cookie contents, getSession alone, editable user_metadata or a client-supplied user ID. Use ownership predicates, RLS and explicit RPC authorization. Revoke public execution of privileged functions and grant apply_billing_event only to the service role. Review SECURITY DEFINER search paths and grants explicitly.

## Billing

Accept only sk_test_ API keys. Resolve enabled plans and Stripe price IDs from the database. Verify the webhook signature against the untouched request body before any privileged operation. The billing RPC must deduplicate event IDs transactionally and prevent stale events from reverting newer state. Test subscription/customer ownership mapping and unsupported event behavior. Checkout redirects never grant entitlements.

## Before release

Verify cross-user read/write denial, unauthenticated RPC denial, blocked/suspended-user behavior, input limits, origin handling on state changes, redirect allowlists, rate limits and report/block flows. Inspect built client assets for accidental secret exposure. Restrict logging and define retention and account-deletion operations. Add monitoring and rehearsed restore procedures.

Public profile discovery requires deliberate policy decisions about fields, consent and visibility. Do not describe this MVP as compliant, audited, abuse-proof or production-ready. Privacy and terms drafts require owner and qualified review before adoption.

Official SSR guidance: https://supabase.com/docs/guides/auth/server-side/nextjs

## Photo handling

The photo upload route accepts bounded JPEG/PNG/WebP input, checks type signatures and decodes with Sharp using a 25-million-pixel limit. It normalizes orientation, resizes inside 1600×2000 without enlargement, and re-encodes WebP without retaining EXIF/GPS metadata. Private profile-photos storage and signed URLs lasting 60 seconds limit access; hosted Storage policies and access-expiry behavior still require integration verification.
