/* eslint-disable @typescript-eslint/no-require-imports */
// SGTX AI verification — clean version with clickBtn helper
const { chromium } = require("playwright");
const HARD_MS = 120000;
const to = setTimeout(() => { console.log("⏰ HARD TIMEOUT"); process.exit(2); }, HARD_MS);
to.unref();
const START = Date.now();
const log = (m) => console.log(`[${((Date.now() - START) / 1000).toFixed(1)}s] ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const has = async (p, t) => { try { return await p.evaluate((s) => document.body.innerText.includes(s), t); } catch { return false; } };

// click a button whose textContent includes `t`
const clickBtn = async (p, t) => p.evaluate((txt) => {
  const el = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(txt));
  if (el) el.click();
  return !!el;
}, t);

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => { if (!r.url().includes("hot-update")) errors.push("REQFAIL: " + r.url().slice(0, 80)); });
  const shot = async (n) => { try { await page.screenshot({ path: `/tmp/sgtx-shots/${n}.png` }); log("📸 " + n); } catch {} };

  try {
    log("→ goto + enter launcher");
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 20000 });
    await wait(3500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
    log("launcher: " + await has(page, "Trader Portal"));

    // TEST 1: AI Assistant chat
    log("→ BUYER portal");
    await page.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Trader Portal — Buyer")); if (c) c.click(); });
    await wait(5000);
    log("→ open AI Assistant (FAB)");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.title === "SGTX AI Assistant"); if (b) b.click(); });
    await wait(1500);
    log("→ send chat message");
    await page.evaluate(() => {
      const inp = document.querySelector("input[placeholder*='Ask the assistant']");
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(inp, "What needs my attention today?");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await wait(500);
    await page.keyboard.press("Enter");
    await wait(7000);
    await shot("ai-01-assistant-chat");
    log("assistant via zai: " + await has(page, "via zai"));
    // close assistant drawer
    await page.evaluate(() => { const x = document.querySelector("button.fixed.right-0.top-0 button, [class*='z-50'] button"); if (x) x.click(); });
    await wait(1500);
    await page.keyboard.press("Escape");
    await wait(1500);

    // TEST 2: Smart Inbox AI Summary
    log("→ open Smart Inbox");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.title === "Smart Inbox"); if (b) b.click(); });
    await wait(1500);
    await clickBtn(page, "Generate");
    await wait(8000);
    await shot("ai-02-inbox-summary");
    log("inbox summary via zai: " + await has(page, "via zai"));
    await page.keyboard.press("Escape");
    await wait(1500);

    // TEST 3: Governor Pre-Screen
    log("→ New Trade Request → Governor pre-screen");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "New Trade Request"); if (b) b.click(); });
    await wait(3000);
    for (let i = 1; i <= 2; i++) { await clickBtn(page, "Continue"); await wait(1500); }
    log("on step 3, running pre-screen");
    await clickBtn(page, "Run AI pre-screen");
    await wait(9000);
    await shot("ai-03-governor-prescreen");
    log("prescreen Verdict: " + await has(page, "Verdict") + " | ALLOW: " + await has(page, "ALLOW"));

    // TEST 4: TCC Health Summary + Why Matters + Trade Room
    log("→ Shipments → open TCC");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Shipments"); if (b) b.click(); });
    await wait(3000);
    await page.evaluate(() => { const r = [...document.querySelectorAll("tr")].find((x) => x.textContent.includes("SGTX-")); if (r) r.click(); });
    await wait(5000);
    await shot("ai-04-tcc");
    log("tcc Health Score: " + await has(page, "Health Score") + " | Trade Room: " + await has(page, "Trade Room"));
    log("→ generate health summary");
    await clickBtn(page, "Generate");
    await wait(8000);
    await shot("ai-05-health-summary");
    log("→ explain why this matters");
    await clickBtn(page, "Explain why");
    await wait(7000);
    await shot("ai-06-why-matters");
    log("→ trade room chat");
    await page.evaluate(() => {
      const inp = document.querySelector("input[placeholder*='Ask about this trade']");
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        setter.call(inp, "What is the current status?");
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.keyboard.press("Enter");
    await wait(8000);
    await shot("ai-07-trade-room");
    log("trade room response: " + await has(page, "SGTX Assistant"));

    // TEST 5: Seller Quote Builder price band
    log("→ reset + Seller → Quote Builder");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
    await page.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Trader Portal — Seller")); if (c) c.click(); });
    await wait(5000);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Quote & Packing")); if (b) b.click(); });
    await wait(3000);
    await clickBtn(page, "Get band");
    await wait(9000);
    await shot("ai-08-price-band");
    log("price band: " + await has(page, "band"));

    // TEST 6: Contract Clause Forge
    log("→ Contract → Clause Forge");
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Contract & Addenda") || x.textContent.includes("Contract Signing")); if (b) b.click(); });
    await wait(3000);
    await clickBtn(page, "Draft clause");
    await wait(9000);
    await shot("ai-09-clause-forge");
    log("clause forged: " + await has(page, "Article"));

    // TEST 7: Dispute root cause
    log("→ reset + Buyer → Disputes → causal analysis");
    await page.evaluate(() => localStorage.clear());
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded", timeout: 15000 });
    await wait(2500);
    await clickBtn(page, "SKIP");
    await wait(2500);
    await clickBtn(page, "Enter the Platform");
    await wait(2500);
    await page.evaluate(() => { const c = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Trader Portal — Buyer")); if (c) c.click(); });
    await wait(5000);
    await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Disputes"); if (b) b.click(); });
    await wait(3000);
    await clickBtn(page, "Run causal analysis");
    await wait(11000);
    await shot("ai-10-dispute-root-cause");
    log("dispute root cause: " + await has(page, "Root cause"));

    // TEST 8: AI Inference Log API
    log("→ inference log API");
    const logRes = await page.evaluate(async () => { const r = await fetch("/api/sgtx/ai/inference-log"); return await r.json(); });
    log("inference records: " + logRes.length);
    if (logRes.length > 0) log("sample: " + logRes[0].agent_name + " | " + logRes[0].authority_level + " | " + logRes[0].provider + " | " + logRes[0].latency_ms + "ms");

    log("\n=== PAGE ERRORS: " + errors.length + " ===");
    errors.slice(0, 8).forEach((e) => log("  ⚠ " + e.slice(0, 120)));
    log("\n✅ AI VERIFICATION COMPLETE");
  } catch (e) {
    log("FATAL: " + e.message.slice(0, 150));
    await shot("error").catch(() => {});
  } finally {
    clearTimeout(to);
    await browser.close().catch(() => {});
    process.exit(0);
  }
})();
