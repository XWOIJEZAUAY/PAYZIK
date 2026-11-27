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
        /* — palette PAYZIK (cahier des charges visuel) :
           fuchsia #E91E83, rose #F43F9E, violet profond #51206F,
           violet intermédiaire #8136A8, lavande #F1E5FA,
           rose pastel #FCEAF4, texte #21152C. Typographie Inter. — */
        white: "#FFFFFF",
        black: "#21152C",
        cream: "#FCEAF4",
        sand: "#FDF9FE",
        night: { DEFAULT: "#51206F", deep: "#3A1152", soft: "#8136A8" },
        navy: { DEFAULT: "#51206F", deep: "#3A1152", soft: "#8136A8" },
        teal: { DEFAULT: "#8136A8", glow: "#D3B0E6", deep: "#51206F" },
        orange: {
          DEFAULT: "#E91E83",
          deep: "#C2185B",
          glow: "#F43F9E",
          soft: "rgba(233,30,131,0.12)",
        },
        coral: {
          DEFAULT: "#E91E83",
          dark: "#C2185B",
          soft: "rgba(233,30,131,0.12)",
        },
        gold: { DEFAULT: "#E91E83", soft: "rgba(233,30,131,0.14)" },
        /* toutes les anciennes familles sont réinterprétées dans la palette
           fuchsia / violet / lavande : cohérence visuelle sur toute l'interface. */
        emerald: {
          50: "#F1E5FA", 100: "#E4D2F2", 200: "#C9A3E0", 300: "#B98AD3",
          400: "#A060BE", 500: "#8136A8", 600: "#6D2A8C", 700: "#51206F",
          800: "#E91E83", 900: "#21152C", DEFAULT: "#E91E83",
        },
        rose: {
          50: "#FCEAF4", 100: "#F8CFE6", 200: "#F2A6CD", 300: "#EC6FAE",
          400: "#F43F9E", 500: "#F43F9E", 600: "#C2185B", 700: "#9B1B52",
          800: "#731643", 900: "#4A0F31", DEFAULT: "#F43F9E",
        },
        amber: {
          50: "#FCEAF4", 100: "#F8CFE6", 200: "#F2A6CD", 300: "#EC6FAE",
          400: "#F43F9E", 500: "#C2185B", 600: "#9B1B52", 700: "#731643",
          800: "#5A459E", 900: "#21152C", DEFAULT: "#C2185B",
        },
        slate: {
          50: "#FDF9FE", 100: "#F7F1FB", 200: "#E9DDF2", 300: "#CDB9DB",
          400: "#A08BAE", 500: "#81748A", 600: "#6D2A8C", 700: "#51206F",
          800: "#21152C", 900: "#160C1D", DEFAULT: "#81748A",
        },
        sky: { 400: "#D3B0E6", 500: "#A060BE", 600: "#8136A8", DEFAULT: "#8136A8" },
        cyan: { 400: "#F43F9E", 500: "#E91E83", 600: "#C2185B", DEFAULT: "#E91E83" },
        fuchsia: { 400: "#F43F9E", 500: "#E91E83", 600: "#C2185B", DEFAULT: "#E91E83" },
        indigo: {
          50: "#F1E5FA", 100: "#E4D2F2", 200: "#C9A3E0",
          500: "#8136A8", 600: "#6D2A8C", 700: "#51206F", DEFAULT: "#8136A8",
        },
        brand: {
          DEFAULT: "#E91E83",
          hover: "#F43F9E",
          soft: "rgba(233,30,131,0.12)",
        },
        accent: {
          DEFAULT: "#8136A8",
          hover: "#A060BE",
          soft: "rgba(129,54,168,0.12)",
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
        card: "0 2px 12px rgba(81,32,111,0.08)",
        pop: "0 12px 40px rgba(81,32,111,0.18)",
        "pop-dark": "0 12px 40px rgba(33,21,44,0.42)",
        glow: "0 0 24px rgba(233,30,131,0.28), 0 6px 20px rgba(129,54,168,0.20)",
        "inner-fine": "inset 0 0 0 1px rgba(81,32,111,0.08)",
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
