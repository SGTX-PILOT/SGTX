/* eslint-disable @typescript-eslint/no-require-imports */
// Verify Parts 0, 1, 2 features in-browser
const { chromium } = require("playwright");
const HARD_MS = 110000;
const to = setTimeout(() => { console.log("⏰ HARD TIMEOUT"); process.exit(2); }, HARD_MS);
to.unref();
const START = Date.now();
const log = (m) => console.log(`[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = async (p, t) => { try { return await p.evaluate((s) => document.body.innerText.includes(s), t); } catch { return false; } };
const clickBtn = async (p, t) => p.evaluate((txt) => { const el = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(txt)); if (el) el.click(); return !!el; }, t);

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const shot = async (n) => { try { await page.screenshot({ path: `/tmp/sgtx-shots/${n}.png` }); log("📸 " + n); } catch {} };

  const resetAndGo = async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
  };

  try {
    log("→ goto + launcher");
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await wait(3500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
    await shot("p0-01-launcher");

    // TEST 1: Onboarding Wizard (Part 2.2)
    log("→ Onboarding Wizard");
    await clickBtn(page, "Onboard New Tenant");
    await wait(3000);
    log("onboarding step 1: " + await has(page, "GTID Confirmation"));
    await page.evaluate(() => { const inp = document.querySelector("input[placeholder*='Strawberry']"); if (inp) { inp.value = "Test Export Co."; inp.dispatchEvent(new Event("input", { bubbles: true })); } });
    await wait(500);
    await clickBtn(page, "Generate GTID");
    await wait(4000);
    const gtidGenerated = await has(page, "Provisional GTID Generated");
    log("GTID generated: " + gtidGenerated);
    await shot("p2-01-onboarding-gtid");
    if (gtidGenerated) { await clickBtn(page, "Confirm GTID"); await wait(2000); await clickBtn(page, "Verify & Continue"); await wait(2000); await clickBtn(page, "Submit Documents"); await wait(2000); await clickBtn(page, "Save Preferences"); await wait(2000); await clickBtn(page, "Continue"); await wait(2000); }
    await shot("p2-02-onboarding-sandbox");

    // TEST 2: Government portal — Governor Decision (Part 1.1)
    log("→ Government portal → Governor Decision");
    await resetAndGo();
    await page.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Government Portal")); if (c) c.click(); });
    await wait(5000);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Governor Decision")); if (b) b.click(); });
    await wait(3000);
    log("governor screen: " + await has(page, "Governor Decision Engine"));
    await clickBtn(page, "Run Governor Decision");
    await wait(6000);
    await shot("p1-01-governor-decision");
    log("governor verdict: " + await has(page, "ALLOW") + " | loomHash: " + await has(page, "Loom Hash") + " | signature: " + await has(page, "Ed25519 Signature"));

    // TEST 3: Loom Verification (Part 1.11)
    log("→ Loom Verification");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Loom Verification")); if (b) b.click(); });
    await wait(3000);
    await clickBtn(page, "Generate Verification Token");
    await wait(3000);
    await clickBtn(page, "Verify Chain");
    await wait(4000);
    await shot("p1-02-loom-verify");
    log("loom token: " + await has(page, "Verification Token") + " | verified: " + await has(page, "Chain Verified"));

    // TEST 4: Jurisdiction Matrix (Part 1.7)
    log("→ Jurisdiction Matrix");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Jurisdiction Matrix")); if (b) b.click(); });
    await wait(3000);
    await shot("p1-03-jurisdictions");
    log("jurisdictions: " + await has(page, "BLOCKED") + " | RESTRICTED: " + await has(page, "RESTRICTED") + " | FULL: " + await has(page, "FULL"));

    // TEST 5: SAR (Part 1.12)
    log("→ SAR");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Suspicious Activity")); if (b) b.click(); });
    await wait(3000);
    await clickBtn(page, "Generate SAR Draft");
    await wait(9000);
    await shot("p1-04-sar");
    log("SAR narrative: " + await has(page, "SUSPICIOUS"));

    // TEST 6: Buyer portal — Network (Part 2.6) + Readiness (Part 2.8)
    log("→ Buyer portal → Network");
    await resetAndGo();
    await page.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Trader Portal — Buyer")); if (c) c.click(); });
    await wait(5000);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Network (Contacts)")); if (b) b.click(); });
    await wait(3000);
    await shot("p2-03-network");
    log("network contacts: " + await has(page, "Trust Portrait") + " | saved: " + await has(page, "Add Contact"));

    log("→ Readiness");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Trade Readiness")); if (b) b.click(); });
    await wait(3000);
    await shot("p2-04-readiness");
    log("readiness score: " + await has(page, "Readiness Score") + " | categories: " + await has(page, "Company") + " | Banking: " + await has(page, "Banking"));

    // TEST 7: GTID Resolution API
    log("→ GTID Resolution API");
    const gtidRes = await page.evaluate(async () => { const r = await fetch("/api/sgtx/gtid/resolve?gtid=SGTX-EG-TRD-002139-7F3A"); return await r.json(); });
    log("GTID resolve: " + gtidRes.legal_name + " | " + gtidRes.lifecycle_state + " | trust " + gtidRes.trust_score);

    log("\n=== PAGE ERRORS: " + errors.length + " ===");
    errors.slice(0, 5).forEach((e) => log("  ⚠ " + e.slice(0, 100)));
    log("\n✅ PARTS 0/1/2 VERIFICATION COMPLETE");
  } catch (e) {
    log("FATAL: " + e.message.slice(0, 150));
    await shot("error").catch(() => {});
  } finally {
    clearTimeout(to);
    await browser.close().catch(() => {});
    process.exit(0);
  }
})();
