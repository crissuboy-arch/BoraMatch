// Real compiled app; synthetic HTTP boundary, not hosted Auth/DB/Realtime.
import { test, expect, type Page } from "@playwright/test";
const me = { id: "me", name: "Synthetic Me", city: "Lisboa", bio: "fixture", interests: [], plan: "free" };
const peers = ["A", "B"].map(n => ({ id: n, profile: { ...me, id: `peer-${n}`, name: `Peer ${n}` } }));
const msg = (id: string, body = id, time = "2026-10-18T12:00:00.123456+00:00") => ({ id, body, senderId: "peer", createdAt: time });
async function fixture(page: Page, messages: (id: string, before: string | null, beforeId: string | null) => Promise<unknown[]>, action?: () => Promise<void>) {
  await page.route("**/api/**", async route => {
    const u = new URL(route.request().url()), resource = u.searchParams.get("resource");
    let data: unknown = [];
    if (u.pathname === "/api/action") { await action?.(); data = {}; }
    else if (resource === "session") data = { user: { id: "me" }, configured: true };
    else if (resource === "profile") data = me;
    else if (resource === "matches") data = peers;
    else if (resource === "messages") {
      try { data = await messages(u.searchParams.get("matchId")!, u.searchParams.get("before"), u.searchParams.get("beforeId")); }
      catch { await route.fulfill({ status: 500, json: { message: "Histórico indisponível" } }); return; }
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/?view=app&tab=chat");
  await expect(page.getByRole("button", { name: /^Peer A/ })).toBeVisible();
}
function deferred() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }
test("F02 clears A immediately while B is slow", async ({ page }) => {
  const b = deferred();
  await fixture(page, async id => { if (id === "B") await b.promise; return [msg(id, `PRIVATE_${id}`)]; });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("PRIVATE_A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Peer B/ }).click();
  try { await expect(page.getByText("PRIVATE_A", { exact: true })).toHaveCount(0); }
  finally { b.release(); }
  await expect(page.getByText("PRIVATE_B", { exact: true })).toBeVisible();
});
test("F02 late A response and late send cannot overwrite B", async ({ page }) => {
  const a = deferred(), send = deferred(); let calls = 0;
  await fixture(page, async id => { if (id === "A" && ++calls > 1) await a.promise; return [msg(id, `PRIVATE_${id}`)]; }, async () => { if (calls) await send.promise; });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("PRIVATE_A", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill("draft A");
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await page.getByRole("button", { name: /^Peer B/ }).click();
  await expect(page.getByText("PRIVATE_B", { exact: true })).toBeVisible();
  send.release(); a.release();
  await page.waitForTimeout(250);
  await expect(page.getByText("PRIVATE_A", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveValue("");
});
test("F02 actual polling GET A in flight cannot overwrite B or its draft", async ({ page }) => {
  await page.clock.install();
  const a = deferred(); let calls = 0, inFlight = false;
  await fixture(page, async id => {
    if (id === "A" && ++calls > 1) { inFlight = true; await a.promise; return [msg("late-a", "LATE_PRIVATE_A")]; }
    return [msg(id, `PRIVATE_${id}`)];
  });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("PRIVATE_A", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill("draft A");
  await page.clock.runFor(15001);
  await expect.poll(() => inFlight).toBe(true);
  await page.getByRole("button", { name: /^Peer B/ }).click();
  await expect(page.getByText("PRIVATE_B", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveValue("");
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).fill("draft B");
  const late = page.waitForResponse(r => r.url().includes("resource=messages") && r.url().includes("matchId=A"));
  a.release(); await late;
  await page.clock.runFor(100);
  await expect(page.getByText("LATE_PRIVATE_A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PRIVATE_B", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveValue("draft B");
});
test("F04 polling preserves already loaded history", async ({ page }) => {
  await page.clock.install(); let latestCalls = 0;
  const recent = Array.from({ length: 100 }, (_, i) => msg(`00000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`, `RECENT_${i}`));
  await fixture(page, async (_id, before) => {
    if (before) return [msg("old", "KEPT_HISTORY", "2026-10-17T00:00:00Z")];
    latestCalls++; return latestCalls > 1 ? [...recent.slice(1), msg("latest", "POLL_NEW", "2026-10-19T00:00:00Z")] : recent;
  });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("RECENT_99", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Carregar mensagens antigas", exact: true }).click();
  await expect(page.getByText("KEPT_HISTORY", { exact: true })).toBeVisible();
  await page.clock.runFor(15001);
  await expect(page.getByText("POLL_NEW", { exact: true })).toBeVisible();
  await expect(page.getByText("KEPT_HISTORY", { exact: true })).toHaveCount(1);
  await expect(page.getByText("RECENT_0", { exact: true })).toHaveCount(1);
});
test("F04 disjoint polling reopens history and recovers gap with composite cursor", async ({ page }) => {
  await page.clock.install(); let calls = 0;
  const row = (n: number) => msg(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, `GAP_${n}`);
  const recent = Array.from({ length: 100 }, (_, i) => row(i + 106));
  const bridge = Array.from({ length: 100 }, (_, i) => row(i + 6));
  const cursors: (string | null)[][] = [];
  await fixture(page, async (_id, before, beforeId) => {
    if (!before) return ++calls === 1 ? [row(1), row(2)] : recent;
    cursors.push([before, beforeId]);
    return beforeId === row(106).id ? bridge : [row(1), row(2), row(3), row(4), row(5)];
  });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("GAP_2", { exact: true })).toBeVisible();
  const older = page.getByRole("button", { name: "Carregar mensagens antigas", exact: true });
  await expect(older).toHaveCount(0);
  await page.clock.runFor(15001);
  await expect(page.getByText("GAP_205", { exact: true })).toBeVisible();
  await expect(older).toBeVisible();
  await older.click();
  await expect(page.getByText("GAP_6", { exact: true })).toBeVisible();
  // An overlapping poll must not rewind the newly advanced history cursor.
  await page.clock.runFor(15001);
  await expect.poll(() => calls).toBe(3);
  await older.click();
  await expect(page.getByText("GAP_3", { exact: true })).toBeVisible();
  expect(cursors).toEqual([[row(106).createdAt, row(106).id], [row(6).createdAt, row(6).id]]);
  await expect(older).toHaveCount(0);
  await expect(page.locator(".bubble p")).toHaveText(Array.from({ length: 205 }, (_, i) => `GAP_${i + 1}`));
});
test("F04 history response in flight cannot overwrite a new polling gap cursor", async ({ page }) => {
  await page.clock.install(); let calls = 0, pending = false;
  const old = deferred(), cursors: (string | null)[] = [];
  const row = (n: number) => msg(`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, `RACE_${n}`);
  const first = Array.from({ length: 100 }, (_, i) => row(i + 1));
  const recent = Array.from({ length: 100 }, (_, i) => row(i + 201));
  await fixture(page, async (_id, before, beforeId) => {
    if (!before) return ++calls === 1 ? first : recent;
    cursors.push(beforeId);
    if (beforeId === row(1).id) { pending = true; await old.promise; return [row(0)]; }
    return Array.from({ length: 100 }, (_, i) => row(i + 101));
  });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("RACE_100", { exact: true })).toBeVisible();
  const older = page.getByRole("button", { name: "Carregar mensagens antigas", exact: true });
  await older.click();
  await expect.poll(() => pending).toBe(true);
  try {
    await page.clock.runFor(15001);
    await expect(page.getByText("RACE_300", { exact: true })).toBeVisible();
  } finally { old.release(); }
  await expect(page.getByText("RACE_0", { exact: true })).toBeVisible();
  await expect(older).toBeEnabled();
  await older.click();
  await expect(page.getByText("RACE_101", { exact: true })).toBeVisible();
  expect(cursors).toEqual([row(1).id, row(201).id]);
  await expect(page.locator(".bubble p")).toHaveText(Array.from({ length: 301 }, (_, i) => `RACE_${i}`));
});
test("F01 logout/demo clears loaded and in-flight private state", async ({ page }) => {
  const b = deferred(); let requested = false;
  await fixture(page, async id => { if (id === "B") { requested = true; await b.promise; } return [msg(id, `PRIVATE_${id}`)]; });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("PRIVATE_A", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Peer B/ }).click();
  await expect.poll(() => requested).toBe(true);
  // Existing logout lives in the desktop sidebar (hidden on mobile).
  // Keep the private request in flight while exposing that same real control.
  if (!await page.getByRole("button", { name: "Sair", exact: true }).isVisible())
    await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Explorar demonstração", exact: true }).click();
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  b.release(); await page.waitForTimeout(250);
  await expect(page.getByText(/PRIVATE_/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Peer [AB]$/ })).toHaveCount(0);
});
test("F01 late profile and matches loads cannot restore private state after logout", async ({ page }) => {
  const pending = deferred(); const requested = new Set<string>();
  await page.route("**/api/**", async route => {
    const resource = new URL(route.request().url()).searchParams.get("resource");
    let data: unknown = [];
    if (resource === "session") data = { user: { id: "me" }, configured: true };
    if (resource === "profile" || resource === "matches") {
      requested.add(resource); await pending.promise;
      data = resource === "profile" ? { ...me, name: "LATE_PRIVATE_PROFILE" } : peers;
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto("/?view=app&tab=chat");
  await expect.poll(() => [...requested].sort()).toEqual(["matches", "profile"]);
  if (!await page.getByRole("button", { name: "Sair", exact: true }).isVisible())
    await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByRole("button", { name: "Explorar demonstração", exact: true }).click();
  const lateProfile = page.waitForResponse(r => r.url().includes("resource=profile"));
  const lateMatches = page.waitForResponse(r => r.url().includes("resource=matches"));
  pending.release(); await Promise.all([lateProfile, lateMatches]);
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await expect(page.getByText("LATE_PRIVATE_PROFILE", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Peer [AB]/ })).toHaveCount(0);
});
test("F04 older history error/retry, cursor, stable order and dedup", async ({ page }) => {
  let attempts = 0; const cursors: string[] = [], ids: (string | null)[] = [];
  const recent = Array.from({ length: 100 }, (_, i) => msg(`00000000-0000-4000-8000-${String(i+1).padStart(12, "0")}`, `NEW_${i}`));
  await fixture(page, async (_id, before, beforeId) => {
    if (!before) return recent;
    cursors.push(before); ids.push(beforeId);
    if (++attempts === 1) throw Error("retry");
    return [msg("old", "OLDER", "2026-10-17T12:00:00Z"), recent[0], msg("old", "OLDER", "2026-10-17T12:00:00Z")];
  });
  await page.getByRole("button", { name: /^Peer A/ }).click();
  await expect(page.getByText("NEW_99", { exact: true })).toBeVisible();
  const older = page.getByRole("button", { name: "Carregar mensagens antigas", exact: true });
  await older.click();
  await expect(page.getByText("Histórico indisponível", { exact: true })).toBeVisible();
  await older.click();
  await expect(page.getByText("OLDER", { exact: true })).toHaveCount(1);
  await expect(page.getByText("NEW_0", { exact: true })).toHaveCount(1);
  expect(cursors).toEqual([recent[0].createdAt, recent[0].createdAt]);
  expect(ids).toEqual([recent[0].id, recent[0].id]);
  await expect(page.locator(".bubble p").first()).toHaveText("OLDER");
});
