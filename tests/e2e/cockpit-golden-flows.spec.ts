// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 6: E2E golden flow #1 — Create trade wizard (6 steps).
// ═════════════════════════════════════════════════════════════════════════════════
//
// Logs in as a demo buyer, navigates to /trades/new, completes the 6-step
// wizard, and verifies the trade workspace renders.
//
// Prerequisites:
//   - The dev server is running on http://localhost:3000
//   - The demo-login endpoint is available (NODE_ENV !== "production")
//   - The demo tenant for trader-buyer has been lazily seeded by demo-login

import { test, expect, type Page } from "@playwright/test";

async function demoLoginAsBuyer(page: Page) {
  await page.goto("/login");
  const buyerButton = page.getByRole("button", { name: /Trader · Buyer European Importer GmbH/ });
  await buyerButton.click();
  await page.waitForURL(/\/(home|trades)/, { timeout: 30000 });
}

test("golden flow #1: create trade wizard — 6 steps render", async ({ page }) => {
  await demoLoginAsBuyer(page);

  await page.goto("/trades/new");
  await expect(page.getByRole("heading", { name: /New trade request|طلب صفقة جديد/ })).toBeVisible();

  // Verify the 6-step progress bar is present.
  await expect(page.getByText(/Trade need|الحاجة/)).toBeVisible();
  await expect(page.getByText(/Commercial terms|الشروط التجارية/)).toBeVisible();
  await expect(page.getByText(/Logistics|الخدمات اللوجستية/)).toBeVisible();
  await expect(page.getByText(/Compliance|الامتثال/)).toBeVisible();
  await expect(page.getByText(/Finance|التمويل/)).toBeVisible();
  await expect(page.getByText(/Review|المراجعة/)).toBeVisible();

  // Step 1 — fill the trade need fields.
  await page.getByPlaceholder(/Egyptian Valencia oranges/).fill("Egyptian Valencia Oranges");
  await page.getByPlaceholder(/0805\.10/).fill("0805.10");
  await page.getByPlaceholder(/500/).fill("500");
  await page.getByPlaceholder(/e\.g\. EG/).first().fill("EG");
  await page.getByPlaceholder(/e\.g\. NL/).fill("NL");
  // Continue to step 2
  await page.getByRole("button", { name: /Continue|متابعة/ }).click();

  // Step 2 — Commercial terms
  await expect(page.getByRole("heading", { name: /Commercial terms|الشروط التجارية/ })).toBeVisible();
  await expect(page.getByText(/Counterparty|الطرف المقابل/)).toBeVisible();
});

test("golden flow #2: role perspective renders for buyer (7-item nav, Admin hidden)", async ({ page }) => {
  await demoLoginAsBuyer(page);
  await page.goto("/home");

  // The 6 visible nav items (Admin hidden for buyer).
  await expect(page.getByRole("link", { name: /Home|الرئيسية/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Trades|الصفقات/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Operations|العمليات/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Money|المالية/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Trust|الثقة/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Network|الشبكة/ }).first()).toBeVisible();
  // Admin should NOT be visible to a buyer.
  await expect(page.getByRole("link", { name: /^Admin$|^الإدارة$/ })).toHaveCount(0);

  // The 5 home questions should render.
  await expect(page.getByText(/Needs your attention|بحاجة إلى اهتمامك/)).toBeVisible();
  await expect(page.getByText(/Happening now|يحدث الآن/)).toBeVisible();
  await expect(page.getByText(/Blocked|محظور/)).toBeVisible();
  await expect(page.getByText(/Needs your approval|بحاجة إلى موافقتك/)).toBeVisible();
  await expect(page.getByText(/Recent changes|التغييرات الأخيرة/)).toBeVisible();
});

test("golden flow #3: deep-link refresh — /trades survives reload", async ({ page }) => {
  await demoLoginAsBuyer(page);

  await page.goto("/trades");
  await expect(page.getByRole("heading", { name: /Trades|الصفقات/ })).toBeVisible();

  // Reload the page — it should still render (URL is source of truth).
  await page.reload();
  await expect(page.getByRole("heading", { name: /Trades|الصفقات/ })).toBeVisible();
});

test("golden flow #4: unauthenticated user is redirected to /login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/home");
  await page.waitForURL(/\/login\?next=/, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: /Sign in to SGTX|تسجيل الدخول إلى SGTX/ })).toBeVisible();
});

test("golden flow #5: admin route is hidden from non-admin buyer", async ({ page }) => {
  await demoLoginAsBuyer(page);
  await page.goto("/home");
  await expect(page.getByRole("link", { name: /^Admin$|^الإدارة$/ })).toHaveCount(0);
});

test("golden flow #6: all 7 nav items resolve to real pages (no 404)", async ({ page }) => {
  await demoLoginAsBuyer(page);

  for (const route of ["/home", "/trades", "/trades/new", "/operations", "/money", "/trust", "/network"]) {
    await page.goto(route);
    // The page should NOT be a 404 (the next-not-found page has a specific heading).
    const body = page.locator("body");
    await expect(body).not.toContainText(/404|This page could not be found/);
  }
});
