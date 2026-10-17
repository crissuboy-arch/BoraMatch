import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Run only in a trusted scheduler; no environment values or user identifiers are logged.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase service configuration required.");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function rpc(name, args = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(`Retention operation failed: ${name}`);
  return data;
}
let canceled = 0,
  removedPhotos = 0,
  removedAccounts = 0;
const cancellations = await rpc("billing_cancellation_queue");
if (cancellations.length) {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_"))
    throw new Error(
      "Stripe test configuration required for queued cancellations.",
    );
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  for (const item of cancellations) {
    const subscription = await stripe.subscriptions.retrieve(
      item.subscription_id,
    );
    if (subscription.livemode)
      throw new Error("Live Stripe subscription rejected.");
    if (subscription.status !== "canceled")
      await stripe.subscriptions.cancel(
        item.subscription_id,
        {},
        { idempotencyKey: `boramatch-delete-${item.id}` },
      );
    await rpc("ack_billing_cancellation", { p_ids: [item.id] });
    canceled++;
  }
}
const { purged } = await rpc("purge_deleted_accounts");
for (const item of await rpc("storage_cleanup_queue")) {
  const { error } = await db.storage.from("profile-photos").remove([item.path]);
  if (error)
    throw new Error("Storage cleanup failed; queue retained for retry.");
  await rpc("ack_storage_cleanup", { p_ids: [item.id] });
  removedPhotos++;
}
for (const item of await rpc("auth_deletion_queue")) {
  const { error } = await db.auth.admin.deleteUser(item.user_id);
  if (error && error.status !== 404)
    throw new Error("Auth cleanup failed; queue retained for retry.");
  await rpc("ack_auth_deletion", { p_users: [item.user_id] });
  removedAccounts++;
}
await rpc("retention_cleanup");
console.log(
  JSON.stringify({
    canceled,
    sqlPurged: purged,
    removedPhotos,
    removedAccounts,
  }),
);
