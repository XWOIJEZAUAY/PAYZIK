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
        /* — palette PAYZIK : orange dominant, crème, brun chaud. Jamais de noir/blanc pur. — */
        white: "#FFF8EA",
        black: "#3A2A1F",
        cream: "#FFF8EA",
        sand: "#F4EDDF",
        night: { DEFAULT: "#3A2A1F", deep: "#241A12", soft: "#5A4230" },
        navy: { DEFAULT: "#3A2A1F", deep: "#241A12", soft: "#5A4230" },
        teal: { DEFAULT: "#FF7A1A", glow: "#FFB27A", deep: "#D95F00" },
        orange: {
          DEFAULT: "#FF7A1A",
          deep: "#D95F00",
          glow: "#FFB27A",
          soft: "rgba(255,122,26,0.14)",
        },
        coral: {
          DEFAULT: "#FF6B57",
          dark: "#E85542",
          soft: "rgba(255,107,87,0.14)",
        },
        gold: { DEFAULT: "#F5B942", soft: "rgba(245,185,66,0.16)" },
        /* toutes les anciennes familles sont réinterprétées en orange/chaud :
           aucun bleu ni vert ne subsiste dans l'interface. */
        emerald: {
          50: "#FFF3E8", 100: "#FFE4CC", 200: "#FFC999", 300: "#FFAE66",
          400: "#FF9333", 500: "#FF7A1A", 600: "#E85F00", 700: "#B84800",
          800: "#8A3500", 900: "#5C2400", DEFAULT: "#FF7A1A",
        },
        rose: {
          50: "#FFF2F0", 100: "#FFE2DD", 200: "#FFC5BB", 300: "#FFA08E",
          400: "#FF8069", 500: "#FF6B57", 600: "#E85542", 700: "#B93E2E",
          800: "#8A2E22", 900: "#5C1F18", DEFAULT: "#FF6B57",
        },
        amber: {
          50: "#FFF8E6", 100: "#FFF0CC", 200: "#FFE099", 300: "#FFCB66",
          400: "#FFB942", 500: "#F5A623", 600: "#D98700", 700: "#A86800",
          800: "#7A4C00", 900: "#4F3100", DEFAULT: "#F5A623",
        },
        slate: {
          50: "#FBF7F0", 100: "#F4EDDF", 200: "#E7DCC9", 300: "#D3C3A9",
          400: "#A99476", 500: "#8B7458", 600: "#6E5A43", 700: "#544433",
          800: "#3A2F24", 900: "#241D16", DEFAULT: "#8B7458",
        },
        sky: { 400: "#FFB27A", 500: "#FF9333", 600: "#FF7A1A", DEFAULT: "#FF7A1A" },
        cyan: { 400: "#F5B942", 500: "#FF7A1A", 600: "#D95F00", DEFAULT: "#FF7A1A" },
        fuchsia: { 400: "#FF8A70", 500: "#FF6B57", 600: "#E85542", DEFAULT: "#FF6B57" },
        indigo: {
          50: "#FFF3E8", 100: "#FFE4CC", 200: "#FFC999",
          500: "#FF7A1A", 600: "#D95F00", 700: "#B84800", DEFAULT: "#FF7A1A",
        },
        brand: {
          DEFAULT: "#FF7A1A",
          hover: "#D95F00",
          soft: "rgba(255,122,26,0.15)",
        },
        accent: {
          DEFAULT: "#FF7A1A",
          hover: "#FFB27A",
          soft: "rgba(255,122,26,0.15)",
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
        card: "0 2px 12px rgba(58,42,31,0.08)",
        pop: "0 12px 40px rgba(58,42,31,0.18)",
        "pop-dark": "0 12px 40px rgba(58,42,31,0.42)",
        glow: "0 0 24px rgba(255,122,26,0.38), 0 6px 20px rgba(255,122,26,0.28)",
        "inner-fine": "inset 0 0 0 1px rgba(58,42,31,0.08)",
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
      },
    },
  },
  plugins: [],
};
