/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        /* — palette PAYZIK : violet profond #433874, violet milieu #8A6EDD,
           lavande #E9E6F5, rose #F4437A. Typographie Inter. — */
        white: "#FFFFFF",
        black: "#2E2659",
        cream: "#FFFFFF",
        sand: "#F7F5FC",
        night: { DEFAULT: "#2E2659", deep: "#1B1638", soft: "#5B4E9E" },
        navy: { DEFAULT: "#2E2659", deep: "#1B1638", soft: "#5B4E9E" },
        teal: { DEFAULT: "#8A6EDD", glow: "#B9A6F0", deep: "#8A6EDD" },
        orange: {
          DEFAULT: "#8A6EDD",
          deep: "#8A6EDD",
          glow: "#B9A6F0",
          soft: "rgba(138,110,221,0.14)",
        },
        coral: {
          DEFAULT: "#F4437A",
          dark: "#D63268",
          soft: "rgba(244,67,122,0.14)",
        },
        gold: { DEFAULT: "#F4437A", soft: "rgba(244,67,122,0.16)" },
        /* toutes les anciennes familles sont réinterprétées dans la palette
           violet / lavande / rose : cohérence visuelle sur toute l'interface. */
        emerald: {
          50: "#F1EEFB", 100: "#E3DBF8", 200: "#C9BAF2", 300: "#B1A0EA",
          400: "#9B7FE8", 500: "#8A6EDD", 600: "#6F55C7", 700: "#5A459E",
          800: "#433874", 900: "#2E2659", DEFAULT: "#8A6EDD",
        },
        rose: {
          50: "#FDE7EF", 100: "#F9CFE0", 200: "#F3A9C9", 300: "#EC79AB",
          400: "#F4437A", 500: "#F4437A", 600: "#D63268", 700: "#A8255A",
          800: "#7A1D46", 900: "#4A1233", DEFAULT: "#F4437A",
        },
        amber: {
          50: "#FDE7EF", 100: "#F9CFE0", 200: "#F3A9C9", 300: "#EC79AB",
          400: "#F4437A", 500: "#D63268", 600: "#A8255A", 700: "#7A1D46",
          800: "#5A459E", 900: "#2E2659", DEFAULT: "#D63268",
        },
        slate: {
          50: "#FAF9FE", 100: "#F7F5FC", 200: "#DFD9EF", 300: "#BDB2DA",
          400: "#8A7DB0", 500: "#6B6389", 600: "#5B4E9E", 700: "#433874",
          800: "#2E2659", 900: "#1B1638", DEFAULT: "#6B6389",
        },
        sky: { 400: "#B9A6F0", 500: "#9B7FE8", 600: "#8A6EDD", DEFAULT: "#8A6EDD" },
        cyan: { 400: "#F4437A", 500: "#8A6EDD", 600: "#8A6EDD", DEFAULT: "#8A6EDD" },
        fuchsia: { 400: "#F4437A", 500: "#F4437A", 600: "#D63268", DEFAULT: "#F4437A" },
        indigo: {
          50: "#F1EEFB", 100: "#E3DBF8", 200: "#C9BAF2",
          500: "#8A6EDD", 600: "#8A6EDD", 700: "#5A459E", DEFAULT: "#8A6EDD",
        },
        brand: {
          DEFAULT: "#433874",
          hover: "#6F55C7",
          soft: "rgba(138,110,221,0.15)",
        },
        accent: {
          DEFAULT: "#8A6EDD",
          hover: "#B9A6F0",
          soft: "rgba(138,110,221,0.15)",
        },
        /* — surfaces sémantiques (variables CSS → thème clair/sombre en une source) — */
        canvas: "var(--c-bg)",
        surface: "var(--c-surface)",
        surface2: "var(--c-surface-2)",
        ink: "var(--c-ink)",
        muted: "var(--c-muted)",
        line: "var(--c-line)",
      },
      boxShadow: {
        card: "0 2px 12px rgba(46,38,89,0.08)",
        pop: "0 12px 40px rgba(46,38,89,0.18)",
        "pop-dark": "0 12px 40px rgba(46,38,89,0.42)",
        glow: "0 0 24px rgba(138,110,221,0.38), 0 6px 20px rgba(138,110,221,0.28)",
        "inner-fine": "inset 0 0 0 1px rgba(46,38,89,0.08)",
      },
      keyframes: {
        wave: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "popIn": {
          "0%": { opacity: "0", transform: "scale(0.6) translateY(8px)" },
          "60%": { opacity: "1", transform: "scale(1.06) translateY(-2px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "paperUnfold": {
          "0%": { opacity: "0", transform: "rotateX(-90deg) scaleY(0.1)", transformOrigin: "top" },
          "60%": { opacity: "1", transform: "rotateX(8deg) scaleY(1.02)", transformOrigin: "top" },
          "100%": { opacity: "1", transform: "rotateX(0deg) scaleY(1)", transformOrigin: "top" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(-10px) scale(.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "scan-line": {
          "0%, 100%": { top: "10%" },
          "50%": { top: "85%" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(220%)" },
        },
      },
      animation: {
        wave: "wave 1s ease-in-out infinite",
        "fade-up": "fade-up .18s ease-out",
        "scale-in": "scale-in .16s ease-out",
        "slide-in-right": "slide-in-right .22s cubic-bezier(.2,.8,.3,1)",
        "popIn": "popIn .45s cubic-bezier(.34,1.56,.64,1)",
        "paperUnfold": "paperUnfold .55s cubic-bezier(.2,.8,.2,1)",
        "toast-in": "toast-in .2s ease-out",
        "scan-line": "scan-line 2.2s ease-in-out infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
