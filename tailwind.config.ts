import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#3d2115",
        paper: "#ffffff",
        field: "#fff7ed",
        line: "#f8c29a",
        teal: "#ef562d",
        coral: "#c2410c",
        amber: "#f59e0b",
        plum: "#9a3412"
      },
      boxShadow: {
        panel: "0 14px 30px rgba(180, 72, 22, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
