import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation primitives.
 *
 * Import `Link`, `redirect`, `useRouter` and `usePathname` from here instead of
 * `next/link` / `next/navigation` anywhere inside the localized app. These
 * wrappers add the `/en` prefix automatically, so a link written as `/menu`
 * keeps the reader in the language they are already browsing.
 */
const {
  Link,
  redirect: baseRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);

export { Link, usePathname, useRouter, getPathname };

/**
 * `redirect`, retyped to return `never`.
 *
 * It throws — it wraps `next/navigation`'s redirect — but next-intl types it as
 * `void`. That difference matters: after `if (!user) redirect(...)` TypeScript
 * would keep `user` as possibly-null, because as far as the types are concerned
 * execution continues. Guards like `requireUser` depend on the narrowing.
 */
export function redirect(...args: Parameters<typeof baseRedirect>): never {
  baseRedirect(...args);
  // Unreachable: baseRedirect always throws.
  throw new Error("redirect() returned instead of throwing");
}
