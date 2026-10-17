import Stripe from "stripe";
import { testStripeKey } from "./validation";
import { adminClient } from "./supabase/server";

export function stripeClient() {
  return new Stripe(testStripeKey(process.env.STRIPE_SECRET_KEY));
}
export type BillingPlan = {
  id: string;
  price_cents: number;
  currency: string;
  stripe_price_id: string;
  active: boolean;
};
export function validatePrice(
  plan: BillingPlan,
  price: Stripe.Price,
  requireActive = true,
) {
  if (
    !["plus", "gold"].includes(plan.id) ||
    (requireActive && (!plan.active || !price.active)) ||
    price.livemode ||
    price.id !== plan.stripe_price_id ||
    !Number.isSafeInteger(plan.price_cents) ||
    plan.price_cents <= 0 ||
    price.unit_amount !== plan.price_cents ||
    price.currency !== plan.currency.toLowerCase() ||
    price.type !== "recurring" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed"
  )
    throw new Error("Preço do plano inválido.");
}
export function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}
export function subscriptionState(subscription: Stripe.Subscription) {
  const status = subscription.status;
  return status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled"
    ? status
    : "unpaid";
}
/** Server-only deletion/outbox helper. Pass the authenticated or queued user ID,
 * never a browser-supplied customer/subscription. Queue retries must precede
 * deletion of billing_accounts so the owned subscription remains discoverable. */
export async function cancelOwnedSubscription(userId: string) {
  const { data: account, error } = await adminClient().rpc("billing_account", {
    p_user: userId,
  });
  if (error) throw error;
  if (!account?.subscription_id) return;
  const stripe = stripeClient();
  const subscription = await stripe.subscriptions.retrieve(
    account.subscription_id,
  );
  if (
    subscription.livemode ||
    objectId(subscription.customer) !== account.customer_id ||
    subscription.metadata.user_id !== userId
  )
    throw new Error("Subscription ownership mismatch");
  if (["canceled", "incomplete_expired"].includes(subscription.status)) return;
  // DELETE cancellation is idempotent by state: retries retrieve canceled first.
  await stripe.subscriptions.cancel(subscription.id);
}
// Bound the stream itself: Content-Length is optional and untrusted.
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new RangeError("Body too large");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
