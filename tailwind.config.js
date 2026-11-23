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
        /* — identité statique (charte PAYZIK) — */
        navy: {
          DEFAULT: "#0B2846",
          deep: "#08182B",
          soft: "#123A63",
        },
        teal: {
          DEFAULT: "#01CCB6",
          glow: "#00F5D4",
          deep: "#01A896",
        },
        brand: {
          DEFAULT: "#0B2846",
          hover: "#123A63",
          soft: "rgba(1,204,182,0.15)",
        },
        accent: {
          DEFAULT: "#01CCB6",
          hover: "#00F5D4",
          soft: "rgba(1,204,182,0.15)",
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
        card: "0 2px 12px rgba(11,40,70,0.06)",
        pop: "0 12px 40px rgba(11,40,70,0.16)",
        "pop-dark": "0 12px 40px rgba(0,0,0,0.5)",
        glow: "0 0 24px rgba(1,204,182,0.35), 0 6px 20px rgba(1,204,182,0.25)",
        "inner-fine": "inset 0 0 0 1px rgba(11,40,70,0.06)",
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
