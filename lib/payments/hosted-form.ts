/**
 * The page that carries the customer to a gateway which must be opened with a
 * form POST (BORICA- and UPC-style vPOS gateways sign the request and expect
 * the browser to post it). Pure, dependency-free; used by
 * /api/payments/start.
 *
 * Security:
 *   - every field and the URL are HTML-escaped;
 *   - the page has its own Content-Security-Policy: no external anything,
 *     one inline script and style allowed by nonce, HTTPS-only form-action,
 *     no framing. The site's other pages are untouched.
 *   - without JavaScript the customer gets a visible button (works in the
 *     Android WebView too).
 */
export interface AutoPostPage {
  html: string;
  csp: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TEXT = {
  bg: {
    title: "Пренасочване към банката",
    body: "Пренасочваме ви към защитената страница за плащане на банката…",
    button: "Продължете към банката",
  },
  en: {
    title: "Redirecting to the bank",
    body: "Taking you to the bank's secure payment page…",
    button: "Continue to the bank",
  },
} as const;

export function buildAutoPostPage(input: {
  url: string;
  fields: Record<string, string>;
  locale: "bg" | "en";
  nonce: string;
}): AutoPostPage {
  const target = new URL(input.url);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("Gateway URL must be http(s)");
  }
  const t = TEXT[input.locale];
  const inputs = Object.entries(input.fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");

  const html =
    `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">` +
    `<title>${t.title}</title>` +
    `<style nonce="${esc(input.nonce)}">body{font-family:system-ui,sans-serif;margin:0;padding:48px 16px;text-align:center;color:#222;background:#fff}` +
    `button{margin-top:16px;padding:12px 24px;border-radius:999px;border:0;background:#15803d;color:#fff;font-size:16px}</style>` +
    `</head><body><p>${t.body}</p>` +
    `<form id="pp-gateway" method="post" action="${esc(target.toString())}">${inputs}` +
    `<noscript><button type="submit">${t.button}</button></noscript></form>` +
    `<script nonce="${esc(input.nonce)}">document.getElementById("pp-gateway").submit();</script>` +
    `</body></html>`;

  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${input.nonce}'`,
    `style-src 'nonce-${input.nonce}'`,
    // Not just the gateway's origin: browsers apply form-action to the
    // redirects that follow the POST, and a gateway may redirect straight to
    // a 3-D Secure / issuer host nobody can list in advance. The action URL
    // itself is fixed by the server above; HTTPS-only is what is enforced.
    `form-action ${target.protocol === "https:" ? "https:" : target.origin}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  return { html, csp };
}
