import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      colors: {
        // Primary brand red — CTAs, prices, important actions (from the logo).
        brand: {
          DEFAULT: "#D42131",
          dark: "#B01827",
          light: "#E7434F",
        },
        // Full Pizza Pazzo palette: white / green / red on warm cream.
        pizza: {
          red: "#D42131",
          "red-dark": "#B01827",
          "red-light": "#FBEAEC",
          green: "#17924A",
          "green-dark": "#0F6B34",
          "green-light": "#E7F3EB",
          cream: "#FBF6EE",
          "cream-dark": "#F3EADB",
          ink: "#2B2622",
          muted: "#7A726A",
        },
        accent: {
          DEFAULT: "#17924A",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        // Slogan/badge font under the logo — matches the logo's carved-serif
        // lettering; falls back to the display serif, never system-ui, so a
        // slow font load never flashes plain sans-serif on brand text.
        slogan: ["var(--font-slogan)", "var(--font-display)", "Georgia", "serif"],
      },
      boxShadow: {
        soft: "0 12px 32px -14px rgba(43, 38, 34, 0.18)",
        card: "0 1px 2px rgba(43,38,34,0.04), 0 10px 24px -16px rgba(43,38,34,0.25)",
        "card-hover": "0 8px 20px -6px rgba(43,38,34,0.18)",
      },
      borderRadius: {
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
