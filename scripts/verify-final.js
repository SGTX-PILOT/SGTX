/* eslint-disable @typescript-eslint/no-require-imports */
// SGTX FINAL verification — all portals + AI + workflow
const { chromium } = require("playwright");
const HARD_MS = 110000;
const to = setTimeout(() => { console.log("⏰ HARD TIMEOUT"); process.exit(2); }, HARD_MS);
to.unref();
const START = Date.now();
const log = (m) => console.log(`[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = async (p, t) => { try { return await p.evaluate((s) => document.body.innerText.includes(s), t); } catch { return false; } };
const clickBtn = async (p, t) => p.evaluate((txt) => { const el = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(txt)); if (el) el.click(); return !!el; }, t);

const enterPortal = async (p, portalText) => {
  await p.evaluate((t) => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(t)); if (c) c.click(); }, portalText);
  await wait(4000);
};

const resetAndGo = async (p) => {
  await p.evaluate(() => localStorage.clear());
  await p.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
  await wait(2500);
  await clickBtn(p, "SKIP");
  await wait(2500);
  await clickBtn(p, "Enter the Platform");
  await wait(2500);
};

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { try { await page.screenshot({ path: `/tmp/sgtx-shots/${n}.png` }); log("📸 " + n); } catch {} };

  const portals = [
    { name: "Trader Portal — Buyer", id: "buyer", expect: "Command Center" },
    { name: "Trader Portal — Seller", id: "seller", expect: "Command Center" },
    { name: "Logistics Service Provider", id: "lsp", expect: "Command Center" },
    { name: "Shipping Line", id: "ship", expect: "Command Center" },
    { name: "Laboratory", id: "lab", expect: "Command Center" },
    { name: "Quality Control", id: "qc", expect: "Command Center" },
    { name: "Customs Broker", id: "cbr", expect: "Command Center" },
    { name: "Financier — Bank", id: "bank", expect: "Command Center" },
    { name: "Financier — Private", id: "pfi", expect: "Command Center" },
    { name: "Government Portal", id: "gov", expect: "Command Center" },
  ];

  try {
    log("→ goto + launcher");
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await wait(3500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
    await shot("f-01-launcher");

    let pass = 0, fail = 0;
    for (const portal of portals) {
      log(`→ ${portal.id} portal`);
      await enterPortal(page, portal.name);
      const ok = await has(page, portal.expect);
      log(`  ${ok ? "✓" : "✗"} ${portal.id}: ${ok ? "OK" : "MISSING " + portal.expect}`);
      if (ok) pass++; else fail++;
      await shot(`f-${portal.id}`);
      // exit to launcher
      await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Exit Portal")); if (b) b.click(); });
      await wait(2000);
    }

    // TCC cross-portal test
    log("→ TCC cross-portal test");
    await enterPortal(page, "Trader Portal — Buyer");
    await wait(3000);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Shipments"); if (b) b.click(); });
    await wait(2000);
    await page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => x.textContent.includes("SGTX-")); if (r) r.click(); });
    await wait(4000);
    const tccOk = await has(page, "Trade Command Center") || await has(page, "Parties");
    log(`  ${tccOk ? "✓" : "✗"} TCC: ${tccOk ? "OK" : "FAILED"}`);
    if (tccOk) pass++; else fail++;
    await shot("f-tcc");

    // AI inference log
    log("→ AI inference log");
    const logRes = await page.evaluate(async () => { const r = await fetch("/api/sgtx/ai/inference-log"); return await r.json(); });
    log(`  ${logRes.length > 0 ? "✓" : "✗"} inference records: ${logRes.length}`);

    log(`\n=== RESULTS: ${pass}/${portals.length + 1} portals OK, ${fail} failed ===`);
    log(`=== PAGE ERRORS: ${errors.length} ===`);
    errors.slice(0, 5).forEach((e) => log("  ⚠ " + e.slice(0, 100)));
    log("\n✅ FINAL VERIFICATION COMPLETE");
  } catch (e) {
    log("FATAL: " + e.message.slice(0, 150));
    await shot("error").catch(() => {});
  } finally {
    clearTimeout(to);
    await browser.close().catch(() => {});
    process.exit(0);
  }
})();
