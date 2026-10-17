import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: vi.fn(),
  construct: vi.fn(),
  retrieve: vi.fn(),
  price: vi.fn(),
  checkout: vi.fn(),
  portal: vi.fn(),
  customers: vi.fn(),
  subs: vi.fn(),
  sessions: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("../src/lib/supabase/server", () => ({
  adminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
  authenticated: mocks.auth,
}));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: mocks.construct };
    subscriptions = {
      retrieve: mocks.retrieve,
      list: mocks.subs,
      cancel: mocks.cancel,
    };
    prices = { retrieve: mocks.price };
    customers = { create: mocks.customers };
    checkout = { sessions: { create: mocks.checkout, list: mocks.sessions } };
    billingPortal = { sessions: { create: mocks.portal } };
  },
}));
import { POST as webhook } from "../src/app/api/stripe/webhook/route";
import { POST as billing } from "../src/app/api/billing/route";
import { boundedBody, cancelOwnedSubscription } from "../src/lib/billing";
const uid = "11111111-1111-4111-8111-111111111111";
const plan = {
  id: "plus",
  price_cents: 900,
  currency: "EUR",
  stripe_price_id: "price_plus",
  active: true,
};
const price = {
  id: "price_plus",
  unit_amount: 900,
  currency: "eur",
  livemode: false,
  active: true,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
};
const sub = () => ({
  id: "sub_one",
  customer: "cus_one",
  metadata: { user_id: uid, plan: "gold" },
  status: "active",
  livemode: false,
  latest_invoice: null,
  cancel_at_period_end: false,
  items: { data: [{ price, quantity: 1, current_period_end: 1900000000 }] },
});
const event = () => ({
  id: "evt_one",
  created: 1800000000,
  type: "customer.subscription.updated",
  livemode: false,
  data: { object: { id: "sub_one" } },
});
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.single.mockResolvedValue({ data, error: null });
  q.maybeSingle.mockResolvedValue({ data, error: null });
  return q;
}
function request(body = "{}", signature = true) {
  return new Request("https://app.test/api/stripe/webhook", {
    method: "POST",
    body,
    headers: signature ? { "stripe-signature": "test-signature" } : {},
  });
}
function buy(body: unknown = { action: "checkout", plan: "plus" }) {
  return new Request("https://app.test/api/billing", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { origin: "https://app.test" },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_mock");
  vi.stubEnv("APP_URL", "https://app.test");
  mocks.construct.mockReturnValue(event());
  mocks.retrieve.mockResolvedValue(sub());
  mocks.price.mockResolvedValue(price);
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.from.mockImplementation((table) =>
    query(
      table === "profiles"
        ? { id: uid, status: "active" }
        : table === "plan_prices"
          ? { plan_id: "plus", price_cents: 900, currency: "EUR" }
          : plan,
    ),
  );
  mocks.auth.mockResolvedValue({ user: { id: uid }, db: { from: mocks.from } });
  mocks.customers.mockResolvedValue({ id: "cus_one" });
  mocks.subs.mockReturnValue([]);
  mocks.sessions.mockReturnValue([]);
  mocks.checkout.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  mocks.portal.mockResolvedValue({ url: "https://billing.stripe.com/test" });
});
describe("mocked Stripe webhook (no external API)", () => {
  it("verifies exact raw bytes before retrieving and applies authoritative price plan", async () => {
    const raw = '{ "raw": true }';
    expect((await webhook(request(raw))).status).toBe(200);
    expect(mocks.construct).toHaveBeenCalledWith(
      Buffer.from(raw),
      "test-signature",
      "whsec_mock",
    );
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "apply_billing_event",
      expect.objectContaining({
        p_plan: "plus",
        p_status: "active",
        p_user: uid,
      }),
    );
  });
  it("rejects invalid and missing signatures without DB writes", async () => {
    mocks.construct.mockImplementation(() => {
      throw Error("signature");
    });
    expect((await webhook(request())).status).toBe(400);
    expect((await webhook(request("{}", false))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects live events and live keys", async () => {
    mocks.construct.mockReturnValue({ ...event(), livemode: true });
    expect((await webhook(request())).status).toBe(400);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_forbidden");
    expect((await webhook(request())).status).toBe(400);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("rejects oversized chunked bodies", async () => {
    expect((await webhook(request("a".repeat(262145)))).status).toBe(413);
    expect(mocks.construct).not.toHaveBeenCalled();
  });
  it("never grants from checkout completion", async () => {
    mocks.construct.mockReturnValue({
      ...event(),
      type: "checkout.session.completed",
    });
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
    "past_due",
    "canceled",
  ])("removes premium for %s", async (status) => {
    mocks.retrieve.mockResolvedValue({ ...sub(), status });
    await webhook(request());
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "apply_billing_event",
      expect.objectContaining({
        p_plan: "free",
        p_status: ["past_due", "canceled"].includes(status) ? status : "unpaid",
      }),
    );
  });
  it("retains active entitlement during scheduled cancellation", async () => {
    mocks.retrieve.mockResolvedValue({ ...sub(), cancel_at_period_end: true });
    await webhook(request());
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "apply_billing_event",
      expect.objectContaining({ p_status: "active", p_plan: "plus" }),
    );
  });
  it("payment failure uses latest invoice and revokes access", async () => {
    mocks.construct.mockReturnValue({
      ...event(),
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_one" } },
        },
      },
    });
    mocks.retrieve.mockResolvedValue({
      ...sub(),
      latest_invoice: { status: "open", attempted: true, paid: false },
    });
    await webhook(request());
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "apply_billing_event",
      expect.objectContaining({ p_status: "unpaid", p_plan: "free" }),
    );
  });
  it("acknowledges DB duplicates/stale results and passes original event timestamps", async () => {
    for (const reason of ["duplicate", "stale", "tie_restrictive"]) {
      mocks.rpc.mockImplementation(async (name) => ({
        data:
          name === "apply_billing_event" ? { applied: false, reason } : null,
        error: null,
      }));
      expect((await webhook(request())).status).toBe(200);
    }
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "apply_billing_event",
      expect.objectContaining({
        p_event_id: "evt_one",
        p_event_created: new Date(1800000000000).toISOString(),
      }),
    );
  });
  it("retries database failures", async () => {
    mocks.rpc.mockResolvedValue({ error: Error("offline") });
    expect((await webhook(request())).status).toBe(500);
  });
  it("rejects customer mismatches", async () => {
    mocks.rpc.mockResolvedValue({
      data: { customer_id: "cus_other" },
      error: null,
    });
    expect((await webhook(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_billing_event",
      expect.anything(),
    );
  });
  it.each(["active", "canceled"])(
    "syncs %s despite editable plan amount/currency drift",
    async (status) => {
      mocks.from.mockImplementation((table) =>
        query(
          table === "plan_prices"
            ? { plan_id: "plus", price_cents: 900, currency: "EUR" }
            : {
                ...plan,
                stripe_price_id: "price_new",
                price_cents: 1900,
                currency: "USD",
                active: false,
              },
        ),
      );
      mocks.retrieve.mockResolvedValue({ ...sub(), status });
      expect((await webhook(request())).status).toBe(200);
      expect(mocks.rpc).toHaveBeenLastCalledWith(
        "apply_billing_event",
        expect.objectContaining({
          p_status: status,
          p_plan: status === "active" ? "plus" : "free",
        }),
      );
    },
  );
  it("requires historical price mapping after price ID rotation; metadata cannot grant a plan", async () => {
    mocks.from.mockReturnValue(query(null));
    expect((await webhook(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_billing_event",
      expect.anything(),
    );
  });
  it("validates immutable historical economics instead of trusting metadata", async () => {
    mocks.from.mockReturnValue(
      query({ plan_id: "plus", price_cents: 1, currency: "EUR" }),
    );
    expect((await webhook(request())).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_billing_event",
      expect.anything(),
    );
  });
  it("looks up the authoritative old price in plan_prices", async () => {
    const historical = query({
      plan_id: "plus",
      price_cents: 900,
      currency: "EUR",
    });
    mocks.from.mockReturnValue(historical);
    await webhook(request());
    expect(mocks.from).toHaveBeenCalledWith("plan_prices");
    expect(mocks.from).not.toHaveBeenCalledWith("plans");
    expect(historical.eq).toHaveBeenCalledWith("stripe_price_id", "price_plus");
    expect(historical.maybeSingle).toHaveBeenCalled();
  });
});
describe("checkout and portal", () => {
  it("creates server-priced Checkout with both metadata records and stable concurrency keys", async () => {
    await Promise.all([billing(buy()), billing(buy())]);
    const [params, options] = mocks.checkout.mock.calls[0];
    expect(params.line_items).toEqual([{ price: "price_plus", quantity: 1 }]);
    expect(params.metadata).toEqual({ user_id: uid, plan: "plus" });
    expect(params.subscription_data.metadata).toEqual(params.metadata);
    expect(mocks.checkout.mock.calls[1][1]).toEqual(options);
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "apply_billing_event",
      expect.anything(),
    );
  });
  it("requires completed profile", async () => {
    mocks.from.mockReturnValue(query(null));
    expect((await billing(buy())).status).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied customer or price", async () => {
    expect(
      (
        await billing(
          buy({
            action: "checkout",
            plan: "plus",
            customer: "cus_attacker",
            price: 1,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each([{ action: "portal" }, { action: "portal", plan: "gold" }])(
    "portal accepts %j and uses only server-owned customer",
    async (body) => {
      mocks.rpc.mockResolvedValue({
        data: { customer_id: "cus_owned" },
        error: null,
      });
      expect((await billing(buy(body))).status).toBe(200);
      expect(mocks.portal).toHaveBeenCalledWith({
        customer: "cus_owned",
        return_url: "https://app.test/?view=app&tab=plans",
      });
    },
  );
  it("requires plan for checkout", async () => {
    expect((await billing(buy({ action: "checkout" }))).status).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("returns checkout success and cancellation to the app plans tab", async () => {
    await billing(buy());
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://app.test/?view=app&tab=plans&checkout=success",
        cancel_url: "https://app.test/?view=app&tab=plans&checkout=canceled",
      }),
      expect.anything(),
    );
  });
  it("routes existing subscription to portal", async () => {
    mocks.subs.mockReturnValue([sub()]);
    await billing(buy());
    expect(mocks.portal).toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("reuses open checkout", async () => {
    mocks.sessions.mockReturnValue([
      { mode: "subscription", url: "https://checkout.stripe.com/existing" },
    ]);
    expect(await (await billing(buy())).json()).toEqual({
      url: "https://checkout.stripe.com/existing",
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each([
    { unit_amount: 1 },
    { currency: "usd" },
    { livemode: true },
    {
      recurring: {
        interval: "year",
        interval_count: 1,
        usage_type: "licensed",
      },
    },
    { active: false },
  ])("rejects mismatched Stripe price %j", async (change) => {
    mocks.price.mockResolvedValue({ ...price, ...change });
    expect((await billing(buy())).status).toBe(400);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
it("bounds advertised body size", async () => {
  await expect(
    boundedBody(
      new Request("https://app.test", {
        method: "POST",
        body: "x",
        headers: { "content-length": "5000" },
      }),
      4096,
    ),
  ).rejects.toBeInstanceOf(RangeError);
});
describe("deletion cancellation ownership", () => {
  it("cancels only the server-owned subscription", async () => {
    mocks.rpc.mockResolvedValue({
      data: { customer_id: "cus_one", subscription_id: "sub_one" },
      error: null,
    });
    await cancelOwnedSubscription(uid);
    expect(mocks.cancel).toHaveBeenCalledWith("sub_one");
  });
  it("does nothing without a linked subscription", async () => {
    await cancelOwnedSubscription(uid);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
  it("rejects another customer before cancellation", async () => {
    mocks.rpc.mockResolvedValue({
      data: { customer_id: "cus_other", subscription_id: "sub_one" },
      error: null,
    });
    await expect(cancelOwnedSubscription(uid)).rejects.toThrow("ownership");
  });
  it("accepts already canceled subscriptions on retry", async () => {
    mocks.rpc.mockResolvedValue({
      data: { customer_id: "cus_one", subscription_id: "sub_one" },
      error: null,
    });
    mocks.retrieve.mockResolvedValue({ ...sub(), status: "canceled" });
    await expect(cancelOwnedSubscription(uid)).resolves.toBeUndefined();
  });
});
