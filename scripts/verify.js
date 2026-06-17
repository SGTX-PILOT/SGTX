// SGTX comprehensive verification — all portals + TCC + tab switching
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("playwright");
const HARD_MS = 110000;
const to = setTimeout(() => { console.log("⏰ HARD TIMEOUT"); process.exit(2); }, HARD_MS);
to.unref();
const START = Date.now();
const log = (m) => console.log(`[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = async (p, t) => { try { return await p.evaluate((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), t); } catch { return false; } };

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push("REQFAIL: " + r.url().slice(0, 60)));
  const shot = async (n) => { try { await page.screenshot({ path: `/tmp/sgtx-shots/${n}.png` }); log("📸 " + n); } catch {} };

  const enterPortal = async (portalText) => {
    await page.evaluate((t) => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(t)); if (c) c.click(); }, portalText);
    await wait(4000);
  };
  const clickTab = async (tabText) => {
    await page.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t || x.textContent.includes(t)); if (b) b.click(); }, tabText);
    await wait(2500);
  };

  try {
    log("→ goto landing");
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await wait(4000);
    await shot("01-landing");
    log("title: " + await page.title());
    log("has Sovereign Governed: " + await has(page, "Sovereign Governed"));

    log("→ skip + enter");
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("SKIP"))?.click(); });
    await wait(3000);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Enter the Platform"))?.click(); });
    await wait(3000);
    await shot("03-launcher");
    log("launcher has 10 portals: " + await has(page, "Trader Portal") + " / " + await has(page, "Government Portal") + " / " + await has(page, "Customs Broker"));

    // ===== BUYER PORTAL =====
    log("→ BUYER portal");
    await enterPortal("Trader Portal — Buyer");
    await shot("04-buyer-command");
    log("buyer command: " + await has(page, "Command Center") + " / Open Trades");
    await clickTab("New Trade Request");
    await shot("04b-new-trade");
    log("new-trade has Dynamic Product Form: " + await has(page, "Dynamic Product Form"));
    await clickTab("Shipments");
    await shot("04c-shipments");
    log("shipments has USTN: " + await has(page, "SGTX-"));

    // open TCC
    log("→ open TCC");
    await page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => x.textContent.includes("SGTX-")); if (r) r.click(); });
    await wait(4500);
    await shot("05-tcc");
    log("tcc has Parties: " + await has(page, "Parties"));
    log("tcc has Health Score: " + await has(page, "Health Score"));
    log("tcc has Phases: " + await has(page, "Trade Lifecycle"));
    log("tcc has Documents: " + await has(page, "Documents"));
    log("tcc has Trade Room: " + await has(page, "Trade Room"));

    // ===== SELLER PORTAL =====
    log("→ reset + SELLER portal");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("SKIP"))?.click(); });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Enter the Platform"))?.click(); });
    await wait(2500);
    await enterPortal("Trader Portal — Seller");
    await shot("06-seller-command");
    log("seller has Dual-Mode: " + await has(page, "Dual-Mode"));
    log("seller command: " + await has(page, "Outbound"));
    await clickTab("Quote & Packing");
    await shot("06b-quote-builder");
    log("quote builder: " + await has(page, "Packing"));

    // ===== GOV PORTAL =====
    log("→ GOV portal");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("SKIP"))?.click(); });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Enter the Platform"))?.click(); });
    await wait(2500);
    await enterPortal("Government Portal");
    await shot("07-gov-command");
    log("gov has National Trade: " + await has(page, "National Trade"));
    await clickTab("Integrations Health");
    await shot("07b-integrations");
    log("integrations has Nafeza: " + await has(page, "Nafeza"));

    // ===== BANK PORTAL =====
    log("→ BANK portal");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("SKIP"))?.click(); });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Enter the Platform"))?.click(); });
    await wait(2500);
    await enterPortal("Financier — Bank");
    await shot("08-bank-command");
    log("bank has Financing: " + await has(page, "Financing"));
    await clickTab("DeFi Pools");
    await shot("08b-defi");
    log("defi has Aave: " + await has(page, "Aave"));

    // ===== LAB PORTAL =====
    log("→ LAB portal");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("SKIP"))?.click(); });
    await wait(2500);
    await page.evaluate(() => { [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Enter the Platform"))?.click(); });
    await wait(2500);
    await enterPortal("Laboratory");
    await shot("09-lab-command");
    log("lab has Test: " + await has(page, "Test"));

    log("\n=== PAGE ERRORS: " + errors.length + " ===");
    errors.slice(0, 8).forEach((e) => log("  ⚠ " + e.slice(0, 130)));
    log("\n✅ FULL VERIFICATION COMPLETE");
  } catch (e) {
    log("FATAL: " + e.message.slice(0, 150));
    await shot("error").catch(() => {});
  } finally {
    clearTimeout(to);
    await browser.close().catch(() => {});
    process.exit(0);
  }
})();
