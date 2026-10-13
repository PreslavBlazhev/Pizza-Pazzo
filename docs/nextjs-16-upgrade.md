# Next.js 16 migration

The site uses Next.js **16.4.0**, React/React DOM **19.3.0**, next-intl
**4.14.9** and Node.js **22 LTS**. These are stable application packages,
not release candidates. Exact versions and the npm lock file make installs
reproducible.

## Runtime changes

- `proxy.ts` replaces `middleware.ts`, using Next 16's Node.js proxy runtime.
  Locale rewrites, guest checkout and role restrictions are preserved.
- Server Actions use `updateTag` for immediate menu, restaurant-settings and
  print-template cache expiration. The previous one-argument `revalidateTag`
  calls are not supported by the Next 16 types.
- Next 16.4's bundled React already restores the hydration cursor when a
  suspended host component is replayed. The Next 15.5 vendor patch,
  `patch-package` dependency, postinstall hook and patch-specific assertions
  are removed. The actual hydration/browser regression test is retained.
- The patch-specific Webpack cache hook is removed. `next build` uses the
  supported Turbopack default.
- ESLint uses Next's native flat configurations. Existing browser-state
  restoration and subscription effects retain their tested behaviour; the new
  `set-state-in-effect` performance rule is a warning for the named legacy
  components only. Other rules remain at their recommended severity.
- ESLint 9.39.5 and PostCSS 8.5.30 provide compatible tooling updates. ESLint
  stays on the latest 9.x patch because Next's current React/import/a11y
  plugins declare support for ESLint 9, not 10.
- The compatible transitive `baseline-browser-mapping` dependency is updated
  to 2.11.28, fixing GHSA-w5vr-8v7q-w6rv. `npm audit --omit=dev` reports no
  vulnerabilities for the final lock file (13 October 2026).
- Test provisioning explicitly creates its disposable SQLite file before
  Prisma 5 applies migrations, avoiding a missing-file connection-probe error
  in the Windows CLI.
- The shared Prisma client's SQLite connection pool is limited to one
  connection. Linux CI exposed an existing Prisma-engine deadlock with five
  concurrent checkouts on a small runner; SQLite's single writer is now queued
  in the pool. The duplicate-order and distinct-order concurrency tests remain
  unchanged and exercise the real application configuration.

There is no new database migration or change to prices, discounts, products,
delivery rules, working hours or payment-provider settings for this upgrade.

## Verification

`.github/workflows/verify.yml` installs from the lock file on Linux/Node 22,
builds production with Turbopack and checks types, lint, translations, business
rules and payments. Browser checks use a disposable local SQLite database,
dummy authentication, a payment simulator and disabled email delivery. They
cover:

- Proxy role restrictions in both locales and immediate menu updates after an
  administrator changes product availability (`npm run e2e:upgrade`).
- Checkout, language switching, retries, lost responses and duplicate-order
  protection (`npm run e2e:checkout-language`).
- Bank-required checkout/legal UI and mobile layouts (`npm run e2e:ubb`).
- Hydration in BG/EN, saved/retired baskets and slow-network conditions
  (`npm run e2e:hydration`). The CI quick matrix retains slow-network coverage;
  an unrestricted run also covers additional timezones and clock boundaries.

No browser test in this workflow uses the public shop, actual payments or
production customer data. Render continues to rebuild the `master` branch
using the existing deployment configuration.

## Future updates

Check `npm view next dist-tags --json` and the official upgrade guide before
changing the pinned version. Update Next's ESLint package and compatible React
types together, regenerate the lock file and pass the workflow before
deployment. Use the documentation bundled with the installed Next version
for version-specific behaviour.

References:

- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://github.com/react/react/pull/35494
