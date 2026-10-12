/**
 * Nav targets. Labels come from the `nav` namespace, keyed by `labelKey`.
 *
 * Kept out of Header.tsx on purpose: the header is a server component that
 * reads the database (the phone under the logo), and the client-side
 * <MobileNav /> must be able to import this list without pulling that in.
 */
export const NAV_LINKS = [
  { href: "/", labelKey: "home" },
  { href: "/menu", labelKey: "menu" },
  { href: "/gallery", labelKey: "gallery" },
  { href: "/reviews", labelKey: "reviews" },
  { href: "/contacts", labelKey: "contacts" },
] as const;
