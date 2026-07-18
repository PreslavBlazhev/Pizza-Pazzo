import { ImageResponse } from "next/og";
import { PIZZA_PAZZO_BRAND, SITE } from "@/lib/constants";

/**
 * Open Graph card (1200×630 PNG), generated at build time — no binary asset to
 * keep in the repo. Next.js wires the <meta og:image> tags automatically for
 * every page under [locale]. Latin text only: the bundled OG font has no
 * guaranteed Cyrillic glyphs.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Pizza Pazzo — pizza delivery since 2012";

const { green, red, white } = PIZZA_PAZZO_BRAND.colors;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: white,
        }}
      >
        <div style={{ display: "flex", height: 18, width: "100%" }}>
          <div style={{ flex: 1, backgroundColor: green }} />
          <div style={{ flex: 1, backgroundColor: white }} />
          <div style={{ flex: 1, backgroundColor: red }} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 40, color: green }}>🍕</div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              fontSize: 110,
              fontWeight: 700,
              color: red,
              letterSpacing: 2,
            }}
          >
            PIZZA PAZZO
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 18,
              fontSize: 34,
              color: green,
              letterSpacing: 6,
            }}
          >
            PIZZA • BURGERS • SALADS • DESSERTS
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 34,
              fontSize: 28,
              color: "#666666",
            }}
          >
            {SITE.website} · est. {SITE.foundedYear}
          </div>
        </div>

        <div style={{ display: "flex", height: 18, width: "100%" }}>
          <div style={{ flex: 1, backgroundColor: green }} />
          <div style={{ flex: 1, backgroundColor: white }} />
          <div style={{ flex: 1, backgroundColor: red }} />
        </div>
      </div>
    ),
    size
  );
}
