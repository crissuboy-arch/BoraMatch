# Architecture

BoraMatch is an independent Next.js App Router application for intentional connections between Brazil and Portugal. This document describes the MVP contract; consult audit.md for verification status.

## Boundaries

- Public pages and responsive navigation render without privileged credentials.
- Supabase SSR supplies cookie-based authentication. Validate the user server-side before protected reads or mutations; browser state is not authorization.
- User requests use the publishable key and the user's session, with Postgres RLS and RPC authorization as the final boundary.
- SUPABASE_SERVICE_ROLE_KEY is server-only and reserved for privileged integration work, including the verified Stripe webhook.
- Stripe is test-only. STRIPE_SECRET_KEY must start with sk_test_. Plan prices and Stripe price identifiers come from the plan table rather than trusted browser input.
- A verified webhook invokes apply_billing_event using the service client. Event deduplication and atomic subscription changes belong in the database RPC.

## Request flows

Public visitor → Next.js public page. Authenticated user → SSR session validation → user-scoped Supabase client → authorized table/RPC. Checkout → server validates plan → Stripe test checkout. Stripe webhook → signature verification of raw body → service-only apply_billing_event → durable billing state.

A success redirect is not evidence of payment and must never grant a subscription. Database migrations, RPC signatures, access policies, and PGlite coverage are documented by their owner in database.md.

## Verification boundaries

Playwright covers real public pages at desktop and mobile sizes, semantic landmarks, navigation, light/dark themes, the synthetic dashboard and selected accessibility checks. Request tests cover explicit anonymous session state, anonymous mutation denial and foreign-origin rejection. These checks are not an accessibility certification. PGlite checks exercise database logic locally; they do not prove hosted Supabase Auth, networking or deployment behavior.

## Photo privacy implementation

The server re-encodes supported uploaded photos as WebP, strips metadata, normalizes orientation and bounds dimensions before private Storage upload. Profile presentation issues signed URLs for 60 seconds. These are source-level implementation facts; hosted upload/access controls have not been verified without configured credentials.

## Interface implementation

The interface uses React components and plain CSS in src/app/globals.css, with design tokens, responsive media queries and a dark-theme attribute. This keeps the custom visual language directly inspectable and avoids adding a utility-framework dependency for this MVP. Inter and Montserrat font files are bundled locally.

## Future VitrinePro boundary

VitrinePro may become an independent commercial referral integration. It is roadmap work, not a current delivered integration. Keep its identities, authentication, database, consent and billing independent from BoraMatch. Any future referral link should carry only explicitly approved non-sensitive attribution; never share session cookies, service keys, profile details, messages or database access by default. Define purpose and consent before adding cross-product data flows.
