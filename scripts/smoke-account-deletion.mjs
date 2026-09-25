/**
 * Smoke test for what deleting an account does to past orders.
 *
 *     node scripts/smoke-account-deletion.mjs
 *
 * This is the promise the privacy policy makes and the one Google Play reads
 * first, so it is worth a test that exercises the real code rather than a
 * re-implementation of it: `lib/privacy.ts` is compiled and called directly.
 *
 * It WRITES to the database — a throwaway user, three orders — and removes
 * everything it made in a `finally`, whether it passed or failed. Point
 * DATABASE_URL at the dev database, never at production.
 *
 * What it proves:
 *   1. a finished order loses the name, e-mail, phone, address and note;
 *   2. the order itself survives — number, date, items and sums intact;
 *   3. an order still being delivered keeps its address, and is flagged;
 *   4. the flagged one is scrubbed when it reaches a terminal status;
 *   5. scrubbing is idempotent and never touches another customer's order.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// The script runs outside Next.js, which normally loads .env for us.
if (!process.env.DATABASE_URL) {
  const env = readFileSync(join(projectRoot, ".env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) {
    console.error("DATABASE_URL is not set and .env does not define it.");
    process.exit(1);
  }
  process.env.DATABASE_URL = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

// ── Compile the modules under test ──────────────────────────────────────────
//
// Same approach as scripts/smoke-checkout.mjs: a generated tsconfig so the
// "@/..." alias resolves, then a patched CJS resolver so the compiled output
// can find both the alias and the project's node_modules from a temp dir.

const buildDir = mkdtempSync(join(tmpdir(), "pp-deletion-smoke-"));
const outRoot = join(buildDir, "out");

const tsconfigPath = join(buildDir, "tsconfig.smoke.json");
writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      target: "es2020",
      lib: ["es2020"],
      module: "commonjs",
      moduleResolution: "node",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      baseUrl: projectRoot,
      paths: { "@/*": ["./*"] },
      rootDir: projectRoot,
      outDir: outRoot,
      types: ["node"],
      typeRoots: [join(projectRoot, "node_modules", "@types")],
    },
    files: [join(projectRoot, "lib/privacy.ts")],
  })
);

try {
  execSync(`npx tsc -p "${tsconfigPath}"`, { stdio: "pipe" });
} catch (e) {
  const detail = e.stdout ? e.stdout.toString().slice(0, 1500) : e.message;
  console.error(`lib/privacy.ts failed to compile standalone:\n${detail}`);
  rmSync(buildDir, { recursive: true, force: true });
  process.exit(1);
}

const projectRequire = createRequire(join(projectRoot, "package.json"));
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    return resolveFilename.call(this, join(outRoot, request.slice(2)), ...args);
  }
  if (!request.startsWith(".") && !request.startsWith("/") && !request.includes(":")) {
    try {
      return projectRequire.resolve(request);
    } catch {
      // built-ins and anything else fall through
    }
  }
  return resolveFilename.call(this, request, ...args);
};

const requireCjs = createRequire(import.meta.url);
const { anonymiseOrdersOfUser, anonymiseIfPending, ANONYMISED_ORDER } = requireCjs(
  join(outRoot, "lib/privacy.js")
);
const { PrismaClient } = projectRequire("@prisma/client");
const prisma = new PrismaClient();

// ── Fixtures ────────────────────────────────────────────────────────────────

const stamp = Date.now();
const made = { users: [], orders: [] };

/** Order numbers are assigned by application logic, so the test picks its own. */
async function nextOrderNumber() {
  const top = await prisma.order.findFirst({ orderBy: { orderNumber: "desc" } });
  return (top?.orderNumber ?? 0) + 1 + made.orders.length;
}

async function makeUser(tag) {
  const user = await prisma.user.create({
    data: {
      email: `smoke-${tag}-${stamp}@example.invalid`,
      passwordHash: "not-a-real-hash",
      fullName: `Смоук ${tag}`,
      phone: "+359888000000",
      role: "CUSTOMER",
    },
  });
  made.users.push(user.id);
  return user;
}

async function makeOrder(user, status) {
  const order = await prisma.order.create({
    data: {
      orderNumber: await nextOrderNumber(),
      userId: user.id,
      customerName: user.fullName,
      customerEmail: user.email,
      customerPhone: "+359888123456",
      deliveryAddress: "ул. Тестова 1, вх. А, ет. 3",
      deliveryCity: "Плевен",
      deliveryNote: "Звънни на съседа",
      status,
      subtotalEur: 12.5,
      deliveryFeeEur: 2,
      totalEur: 14.5,
    },
  });
  made.orders.push(order.id);
  return order;
}

const read = (id) => prisma.order.findUnique({ where: { id } });

const isScrubbed = (o) =>
  o.customerName === ANONYMISED_ORDER.customerName &&
  o.customerEmail === "" &&
  o.customerPhone === "" &&
  o.deliveryAddress === "" &&
  o.deliveryNote === null &&
  o.anonymizedAt !== null;

const keepsItsMoney = (o, original) =>
  o.orderNumber === original.orderNumber &&
  Number(o.totalEur) === Number(original.totalEur) &&
  Number(o.subtotalEur) === Number(original.subtotalEur) &&
  o.createdAt.getTime() === original.createdAt.getTime() &&
  o.deliveryCity === original.deliveryCity;

// ── The test ────────────────────────────────────────────────────────────────

try {
  const customer = await makeUser("customer");
  const bystander = await makeUser("bystander");

  const delivered = await makeOrder(customer, "DELIVERED");
  const inProgress = await makeOrder(customer, "OUT_FOR_DELIVERY");
  const somebodyElses = await makeOrder(bystander, "DELIVERED");

  console.log("1) Deleting the account");
  const result = await anonymiseOrdersOfUser(customer.id);
  check(result.scrubbed === 1, `one finished order scrubbed (got ${result.scrubbed})`);
  check(result.deferred === 1, `one order in progress deferred (got ${result.deferred})`);

  const afterDelivered = await read(delivered.id);
  check(isScrubbed(afterDelivered), "the delivered order lost name, e-mail, phone, address, note");
  check(keepsItsMoney(afterDelivered, delivered), "…while keeping its number, date, city and sums");

  const afterInProgress = await read(inProgress.id);
  check(
    afterInProgress.deliveryAddress === inProgress.deliveryAddress,
    "the order still out for delivery keeps its address"
  );
  check(afterInProgress.anonymizePending === true, "…and is flagged to be scrubbed when it closes");
  check(afterInProgress.anonymizedAt === null, "…and is not counted as scrubbed yet");

  const afterBystander = await read(somebodyElses.id);
  check(
    afterBystander.customerName === somebodyElses.customerName &&
      afterBystander.anonymizedAt === null,
    "another customer's order is untouched"
  );

  console.log("2) The deferred order finishes");
  // The real path is setOrderStatus() in lib/orders.ts, which calls this on
  // every terminal transition; importing that module would drag Next.js in.
  const scrubbedNow = await anonymiseIfPending(inProgress.id);
  check(scrubbedNow === true, "closing the order scrubbed it");
  const closed = await read(inProgress.id);
  check(isScrubbed(closed), "…name, e-mail, phone, address and note are gone");
  check(closed.anonymizePending === false, "…and the flag is cleared");

  console.log("3) Doing it twice is harmless");
  check((await anonymiseIfPending(inProgress.id)) === false, "a second scrub does nothing");
  const again = await anonymiseOrdersOfUser(customer.id);
  check(
    again.scrubbed === 0 && again.deferred === 0,
    "re-running the deletion finds nothing left to scrub"
  );

  console.log("4) The orders survive the user row");
  await prisma.user.delete({ where: { id: customer.id } });
  const orphan = await read(delivered.id);
  check(orphan !== null, "the order outlives the account");
  check(orphan.userId === null, "…detached from it");
} finally {
  // Clean up in reverse: orders first (they reference the users).
  for (const id of made.orders) {
    await prisma.order.deleteMany({ where: { id } });
  }
  for (const id of made.users) {
    await prisma.user.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
  rmSync(buildDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nACCOUNT-DELETION SMOKE FAILED — ${failures} check(s)`);
  process.exit(1);
}
console.log("\nAccount-deletion smoke passed.");
