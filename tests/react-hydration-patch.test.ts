/**
 * The hydration fix (React #418 under a slow connection) lives in a patch to
 * the react-dom that Next vendors — patches/next+15.5.20.patch, applied by
 * `patch-package` on every `npm install` (also on Render).
 *
 * The bug: when a host element (<li>, <div>…) suspends WHILE it is being
 * hydrated — its child is a client component whose code or RSC data has not
 * arrived yet — React replays it without rewinding the hydration cursor, so
 * the replay compares <li> with the <a> inside it and throws #418
 * ("server rendered HTML didn't match"). React 19.3.0 fixed it in
 * replaySuspendedUnitOfWork; Next 15.5.x (up to 15.5.27) still vendors a
 * 19.2 canary without the fix. The patch backports those 8 lines.
 *
 * This test fails if an install skipped the patch, or if Next was upgraded
 * and the patch no longer matches — then the bug would be back silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dir = require.resolve("next/package.json").replace(/package\.json$/, "dist/compiled/react-dom/cjs/");

test("Next is the version the patch was written for", () => {
  assert.equal(require("next/package.json").version, "15.5.20");
});

for (const file of [
  "react-dom-client.production.js",
  "react-dom-client.development.js",
  "react-dom-profiling.profiling.js",
  "react-dom-profiling.development.js",
]) {
  test(`${file}: a replayed host component rewinds the hydration cursor`, () => {
    const src = readFileSync(dir + file, "utf8");
    const start = src.indexOf("function replaySuspendedUnitOfWork(");
    assert.ok(start > 0, "replaySuspendedUnitOfWork found");
    const body = src.slice(start, start + 2500);
    assert.match(body, /fiber === hydrationParentFiber &&/);
    assert.match(body, /\(nextHydratableInstance = fiber\.stateNode\)/);
  });
}
