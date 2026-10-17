import { z } from "zod";
import { authenticated, adminClient } from "../../../lib/supabase/server";
import { checkOrigin, failure } from "../../../lib/http";
import { boundedBody, stripeClient, validatePrice } from "../../../lib/billing";

export const runtime = "nodejs";
const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("checkout"), plan: z.enum(["plus", "gold"]) })
    .strict(),
  z
    .object({
      action: z.literal("portal"),
      plan: z.enum(["plus", "gold"]).optional(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { db, user } = await authenticated();
    const { action, plan } = input.parse(
      JSON.parse((await boundedBody(request, 4096)).toString("utf8")),
    );
    const stripe = stripeClient();
    const admin = adminClient();
    const { data: account, error: accountError } = await admin.rpc(
      "billing_account",
      { p_user: user.id },
    );
    if (accountError) throw accountError;
    const origin = new URL(process.env.APP_URL || request.url).origin;
    const portal = async (customer: string) => {
      const session = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${origin}/?view=app&tab=plans`,
      });
      return Response.json({ url: session.url });
    };
    if (action === "portal") {
      if (!account?.customer_id)
        throw new Error("Conta de pagamentos inexistente.");
      return await portal(account.customer_id);
    }
    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("id,status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== "active")
      throw new Error("É necessário completar o perfil ativo.");
    // One stable customer across plans/days, including requests before the first webhook.
    const customer =
      account?.customer_id ||
      (
        await stripe.customers.create(
          { metadata: { user_id: user.id } },
          { idempotencyKey: `boramatch:customer:${user.id}` },
        )
      ).id;
    for await (const subscription of stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    })) {
      if (subscription.livemode)
        throw new Error("Apenas pagamentos de testes permitidos.");
      if (!["canceled", "incomplete_expired"].includes(subscription.status))
        return await portal(customer);
    }
    const { data: configured, error: planError } = await admin
      .from("plans")
      .select("id,price_cents,currency,stripe_price_id,active")
      .eq("id", plan)
      .single();
    if (planError || !configured?.stripe_price_id)
      throw new Error("Plano não configurado.");
    validatePrice(
      configured,
      await stripe.prices.retrieve(configured.stripe_price_id),
    );
    // Cross-plan and cross-midnight requests reuse the same unexpired Checkout.
    for await (const session of stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 100,
    })) {
      if (session.mode === "subscription" && session.url)
        return Response.json({ url: session.url });
    }
    const day = new Date().toISOString().slice(0, 10);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        client_reference_id: user.id,
        line_items: [{ price: configured.stripe_price_id, quantity: 1 }],
        metadata: { user_id: user.id, plan },
        subscription_data: { metadata: { user_id: user.id, plan } },
        success_url: `${origin}/?view=app&tab=plans&checkout=success`,
        cancel_url: `${origin}/?view=app&tab=plans&checkout=canceled`,
      },
      { idempotencyKey: `boramatch:checkout:${user.id}:${day}` },
    );
    if (!session.url) throw new Error("Checkout indisponível.");
    return Response.json({ url: session.url });
  } catch (error) {
    if (error instanceof RangeError)
      return Response.json(
        { error: "Pedido excede o limite." },
        { status: 413 },
      );
    return failure(error);
  }
}
