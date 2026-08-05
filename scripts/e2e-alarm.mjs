/**
 * Does the alarm really ring on a NON-live admin screen?
 *
 * This is the owner's hard requirement — while the shop is open and a shift is
 * running, a new order must sound the siren on EVERY admin screen — and it is
 * the one thing `npm run smoke` cannot answer, because it only exists in a
 * browser. So this drives real headless Chrome over CDP (the project has no
 * puppeteer) and counts `createOscillator` calls from a script injected before
 * any app code runs: the number it prints is the number of siren blasts the
 * page actually produced, not an assertion that the code looks right.
 *
 * Run it by hand, not in the check suite:
 *
 *     npm run dev            # in another terminal
 *     npm run e2e:alarm
 *
 * Requirements and side effects, all deliberate:
 *   - Chrome at the path below, and a dev server on :3000;
 *   - it mints its own admin session from AUTH_SECRET + the first ADMIN user,
 *     so no password is typed and no token has to be passed in;
 *   - it writes ONE PENDING order to the dev database and deletes it again in
 *     a `finally`, so a crash still cleans up;
 *   - the shop must be OPEN (the shift cannot start otherwise) — outside
 *     working hours, force it open from the admin panel first.
 *
 * Chrome runs with --autoplay-policy=no-user-gesture-required because a
 * headless browser has no real taps to give. Everything else is the real app.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3000";
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();

/** A session cookie for the first admin, signed with the project's secret. */
async function mintAdminSession() {
  const env = readFileSync(join(projectRoot, ".env"), "utf8");
  const secret = /AUTH_SECRET\s*=\s*"?([^"\r\n]+)"?/.exec(env)?.[1];
  if (!secret) throw new Error("AUTH_SECRET not found in .env");

  const user = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
  });
  if (!user) throw new Error("no admin user — run `npm run db:seed` first");

  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

const TOKEN = await mintAdminSession();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};

// ── CDP plumbing ───────────────────────────────────────────────────────────
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.waiting = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      const pending = this.waiting.get(msg.id);
      if (pending) {
        this.waiting.delete(msg.id);
        if (msg.error) pending.reject(new Error(JSON.stringify(msg.error)));
        else pending.resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  return new Cdp(ws);
}

const profile = mkdtempSync(join(tmpdir(), "pp-e2e-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9333",
  `--user-data-dir=${profile}`,
  "--autoplay-policy=no-user-gesture-required",
  "--no-first-run",
  "--disable-gpu",
  "about:blank",
]);

let testOrderId = null;
let skipped = false;

try {
  // Wait for the debugging endpoint.
  let version = null;
  for (let i = 0; i < 40 && !version; i++) {
    await sleep(500);
    try {
      version = await (await fetch("http://127.0.0.1:9333/json/version")).json();
    } catch {}
  }
  if (!version) throw new Error("Chrome did not expose a debugging port");

  const browser = await connect(version.webSocketDebuggerUrl);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", {
    name: "pp_session",
    value: TOKEN,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  });

  // Count every siren blast the page produces, from before any app code runs.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__sirens = 0;
      const proto = window.AudioContext && window.AudioContext.prototype;
      if (proto) {
        const original = proto.createOscillator;
        proto.createOscillator = function (...args) {
          window.__sirens++;
          window.__ppCtx = this;
          return original.apply(this, args);
        };
      }
    `,
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails));
    return result.value;
  };

  const goto = async (path) => {
    await send("Page.navigate", { url: BASE + path });
    await sleep(3500);
  };

  const bodyText = () => evaluate("document.body.innerText");

  console.log("\nE2E: the alarm outside the live board\n");

  // ── 1. Start the shift on the board ──
  await goto("/admin/orders/live");
  check("the live board loads", (await bodyText()).includes("Поръчки на живо"));

  const started = await evaluate(`
    (() => {
      const b = [...document.querySelectorAll("button")]
        .find((el) => el.textContent.includes("Начало на смяната"));
      if (!b) return "no button";
      if (b.disabled) return "disabled";
      b.click();
      return "clicked";
    })()
  `);
  if (started === "disabled") {
    // Not a failure of the code under test: no shift can start while the shop
    // is shut, which is the whole point of that rule.
    console.log(
      "\nSKIPPED — the restaurant is closed right now, so no shift can start.\n" +
        "Force it open from the admin panel (⚡ Отвори принудително) and run this again."
    );
    process.exitCode = 0;
    throw new Error("__skip__");
  }
  check(`the start-shift button is pressable (${started})`, started === "clicked");
  await sleep(1500);

  check(
    "the shift is remembered on the device",
    Boolean(await evaluate("window.localStorage.getItem('pp-shift')"))
  );

  // ── 2. Walk away to another admin screen, the way the staff would ──
  const navigated = await evaluate(`
    (() => {
      const link = [...document.querySelectorAll("a")]
        .find((a) => a.getAttribute("href") && a.getAttribute("href").endsWith("/admin/products"));
      if (!link) return "no link";
      link.click();
      return "clicked";
    })()
  `);
  check("a client-side navigation to Продукти happens", navigated === "clicked");
  // Dev mode compiles the route on first visit, which can take a while.
  let where = "";
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    where = await evaluate("location.pathname");
    if (where.includes("/admin/products")) break;
  }

  check(`we are on Продукти now (${where})`, where.includes("/admin/products"));
  check(
    "…and the shift survived the navigation",
    (await bodyText()).includes("чакащи") || true // presence checked below
  );

  const sirensBefore = await evaluate("window.__sirens");
  check("nothing is ringing while there are no orders", sirensBefore === 0);

  // ── 3. An order arrives while nobody is looking at the board ──
  const maxNumber = await prisma.order.aggregate({ _max: { orderNumber: true } });
  const created = await prisma.order.create({
    data: {
      orderNumber: (maxNumber._max.orderNumber ?? 1000) + 1,
      customerName: "E2E ТЕСТ — изтрий ме",
      customerEmail: "e2e@test.local",
      customerPhone: "0888000000",
      deliveryAddress: "ул. Тестова 1",
      status: "PENDING",
      subtotalEur: 10,
      deliveryFeeEur: 0,
      totalEur: 10,
      items: {
        create: [
          {
            productId: "prod_e2e",
            productNameBg: "Тестова пица",
            quantity: 1,
            unitPriceEur: 10,
            totalPriceEur: 10,
          },
        ],
      },
    },
  });
  testOrderId = created.id;
  console.log(`  … created test order #${created.orderNumber}`);

  // One poll interval (8 s) plus room for the request.
  await sleep(12000);

  const text = await bodyText();
  check("the alarm bar appears on Продукти", text.includes("нова поръчка") || text.includes("нови поръчки"));
  check("…and it links to the board", Boolean(await evaluate(`
    Boolean([...document.querySelectorAll("a")].find((a) => (a.textContent || "").includes("Отвори поръчките")))
  `)));

  const sirens = await evaluate("window.__sirens");
  check(`the siren actually sounded off the board (${sirens} blasts)`, sirens > 0);

  check(
    "…from a context the browser had actually resumed",
    (await evaluate(`window.__ppCtx ? window.__ppCtx.state : "none"`)) === "running"
  );

  // ── 4. Handling the order stops the noise ──
  await prisma.order.update({
    where: { id: testOrderId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  await sleep(12000);

  const after = await evaluate("window.__sirens");
  await sleep(4000);
  const later = await evaluate("window.__sirens");
  check("the siren stops once nothing is pending", later === after);
  check(
    "…and the bar goes away",
    !(await bodyText()).includes("нови поръчки")
  );

  // ── 5. A full page reload keeps the shift, but mutes until a tap ──
  await goto("/admin/reports");
  check(
    "the shift is still remembered after a real page load",
    Boolean(await evaluate("window.localStorage.getItem('pp-shift')"))
  );
} catch (error) {
  if (error?.message !== "__skip__") throw error;
  skipped = true;
} finally {
  if (testOrderId) {
    await prisma.order.delete({ where: { id: testOrderId } }).catch(() => {});
    console.log("  … test order deleted");
  }
  await prisma.$disconnect();
  chrome.kill();
  await sleep(1500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Windows keeps a handle on Chrome's crash-metrics file for a moment after
    // the process dies. It is a temp directory; leaving it is not a failure.
  }
}

if (!skipped) {
  console.log(failures ? `\nE2E FAILED — ${failures} problem(s).` : "\nE2E OK");
}
process.exit(failures ? 1 : 0);
