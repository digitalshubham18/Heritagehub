import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: "#FAF6EE", 100: "#F3ECDD", 200: "#E9DFC8" },
        forest: { DEFAULT: "#1F4D3A", 50: "#E8F0EB", 700: "#173B2C", 900: "#0F271D" },
        terracotta: { DEFAULT: "#B8532E", 50: "#FAEBE4", 600: "#9C4222" },
        ink: "#26261F",
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-hi)", "Georgia", "serif"],
        sans: ["var(--font-body)", "var(--font-hi)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
