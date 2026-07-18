/**
 * Twitter card image — the same artwork as the Open Graph card. A separate
 * metadata route only so <meta name="twitter:image"> is emitted explicitly
 * instead of relying on crawlers falling back to og:image.
 */
export { default, size, contentType, alt } from "./opengraph-image";
