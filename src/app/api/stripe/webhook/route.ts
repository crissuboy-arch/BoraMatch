import Stripe from "stripe";
import { adminClient } from "../../../../lib/supabase/server";
import {
  boundedBody,
  objectId,
  stripeClient,
  subscriptionState,
  validatePrice,
} from "../../../../lib/billing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let stripe: Stripe;
  let event: Stripe.Event;
  try {
    stripe = stripeClient();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret?.startsWith("whsec_"))
      return Response.json(
        { error: "Webhook não configurado." },
        { status: 503 },
      );
    const signature = request.headers.get("stripe-signature");
    if (!signature)
      return Response.json(
        { error: "Assinatura necessária." },
        { status: 400 },
      );
    event = stripe.webhooks.constructEvent(
      await boundedBody(request, 262144),
      signature,
      secret,
    );
    if (event.livemode)
      return Response.json(
        { error: "Apenas eventos de testes permitidos." },
        { status: 400 },
      );
  } catch (error) {
    return Response.json(
      { error: "Webhook inválido." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  try {
    const subscriptionEvent = [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type);
    const invoiceEvent = ["invoice.payment_failed", "invoice.paid"].includes(
      event.type,
    );
    if (!subscriptionEvent && !invoiceEvent)
      return Response.json({ received: true });
    const invoice = event.data.object as Stripe.Invoice;
    const id = subscriptionEvent
      ? (event.data.object as Stripe.Subscription).id
      : objectId(invoice.parent?.subscription_details?.subscription);
    if (!id) return Response.json({ received: true });
    // Event payloads may arrive late. Never grant from Checkout or stale snapshots.
    const subscription = await stripe.subscriptions.retrieve(id, {
      expand: ["latest_invoice"],
    });
    if (subscription.livemode)
      return Response.json(
        { error: "Live subscription rejected." },
        { status: 400 },
      );
    const user = subscription.metadata.user_id;
    if (
      !user ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        user,
      )
    )
      throw new Error("Missing subscription owner");
    const customer = objectId(subscription.customer);
    if (!customer) throw new Error("Missing customer");
    const admin = adminClient();
    const { data: account, error: accountError } = await admin.rpc(
      "billing_account",
      { p_user: user },
    );
    if (accountError) throw accountError;
    if (account?.customer_id && account.customer_id !== customer)
      throw new Error("Customer ownership mismatch");
    // An event from a replaced subscription cannot overwrite the current account.
    if (account?.subscription_id && account.subscription_id !== id) {
      const current = await stripe.subscriptions.retrieve(
        account.subscription_id,
      );
      if (!["canceled", "incomplete_expired"].includes(current.status))
        return Response.json({ received: true });
    }
    const item = subscription.items.data[0];
    if (subscription.items.data.length !== 1 || item.quantity !== 1)
      throw new Error("Unsupported subscription items");
    const { data: historical, error: planError } = await admin
      .from("plan_prices")
      .select("plan_id,price_cents,currency")
      .eq("stripe_price_id", item.price.id)
      .maybeSingle();
    if (planError || !historical) throw new Error("Unknown subscription price");
    // admin_save_plan preserves immutable versions before price rotation.
    // Validate historical economics, independently of today's editable plan.
    // Never fall back to session/subscription/product metadata for entitlements.
    const plan = {
      id: historical.plan_id,
      price_cents: historical.price_cents,
      currency: historical.currency,
      stripe_price_id: item.price.id,
      active: true,
    };
    validatePrice(plan, await stripe.prices.retrieve(item.price.id), false);
    let status = subscriptionState(subscription);
    const latest = subscription.latest_invoice;
    if (
      latest &&
      typeof latest !== "string" &&
      latest.status === "open" &&
      latest.attempted
    )
      status = "unpaid";
    const paid = status === "active" || status === "trialing";
    const { error } = await admin.rpc("apply_billing_event", {
      p_event_id: event.id,
      p_user: user,
      p_status: status,
      p_plan: paid ? plan.id : "free",
      p_customer: customer,
      p_subscription: id,
      p_event_created: new Date(event.created * 1000).toISOString(),
      p_period_end: new Date(item.current_period_end * 1000).toISOString(),
    });
    if (error) throw error;
    return Response.json({ received: true });
  } catch {
    // Retry transient Stripe/database errors; never acknowledge an unapplied event.
    return Response.json(
      { error: "Billing synchronization failed." },
      { status: 500 },
    );
  }
}
