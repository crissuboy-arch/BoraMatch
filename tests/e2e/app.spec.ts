import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public landing page is semantic and fits the viewport", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/BoraMatch/i);
  await expect(page.locator("html")).toHaveAttribute("lang", /^pt(?:-|$)/);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("landing.png"),
    fullPage: true,
  });
});

test("public controls have accessible names and images have alternatives", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const control of await page.getByRole("button").all()) {
    if (await control.isVisible())
      await expect(control).toHaveAccessibleName(/\S/);
  }
  for (const link of await page.getByRole("link").all()) {
    if (await link.isVisible()) await expect(link).toHaveAccessibleName(/\S/);
  }
  await expect(page.locator("img:not([alt])")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});

test("public page has no automated WCAG A/AA violations", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("registration opens with labelled age and account fields", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Começar minha história" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Data de nascimento", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar minha conta", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(/Bora começar/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("synthetic demo is clearly labelled and navigable", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(page).toHaveURL(/view=app/);
  await expect(
    page.getByText(
      "Demonstração com personagens sintéticos. Nenhuma ação é salva.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Descobrir", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conversas", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation")
      .getByRole("button", { name: "Meu perfil", exact: true }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("demo-light.png"),
    fullPage: true,
  });
});

for (const [path, title] of [
  ["/privacidade", "Privacidade"],
  ["/termos", "Termos"],
  ["/seguranca", "Segurança"],
]) {
  test("development information page: " + title, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { name: title, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("note")).toContainText(
      "Versão em desenvolvimento.",
    );
    await expect(
      page.getByRole("link", { name: "← Voltar ao BoraMatch" }),
    ).toHaveAttribute("href", "/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("anonymous session is explicit and protected mutations deny anonymous callers", async ({
  request,
}) => {
  const session = await request.get("/api/data?resource=session");
  expect(session.status()).toBe(200);
  const body = await session.json();
  expect(body.data.user).toBeNull();
  expect(typeof body.data.configured).toBe("boolean");
  const denied = await request.post("/api/action", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { action: "like", targetId: "00000000-0000-4000-8000-000000000001" },
  });
  expect([401, 503]).toContain(denied.status());
});

test("state-changing API rejects a foreign origin", async ({ request }) => {
  const response = await request.post("/api/action", {
    headers: { Origin: "https://untrusted.example" },
    data: { action: "like", targetId: "00000000-0000-4000-8000-000000000001" },
  });
  expect(response.status()).toBe(403);
});

test("dark theme landing and synthetic dashboard pass automated accessibility checks", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.getByRole("button", {
    name: "Ativar tema escuro",
    exact: true,
  });
  const bounds = await toggle.boundingBox();
  expect(bounds).not.toBeNull();
  const visual = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(visual.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(visual.height + 1);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const scans = [];
  for (const view of ["landing", "demo"]) {
    if (view === "demo")
      await page.getByRole("button", { name: "Explorar demonstração" }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    scans.push({ view, violations: results.violations });
    await page.screenshot({
      path: testInfo.outputPath(view + "-dark.png"),
      fullPage: true,
    });
  }
  expect(scans).toEqual([
    { view: "landing", violations: [] },
    { view: "demo", violations: [] },
  ]);
});
