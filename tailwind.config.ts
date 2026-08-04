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
        ink: "#24313a",
        paper: "#ffffff",
        field: "#f8fafc",
        line: "#d9dee5",
        teal: "#f26a2e",
        coral: "#d9480f",
        amber: "#f59e0b",
        plum: "#5b6b7a"
      },
      boxShadow: {
        panel: "0 14px 30px rgba(36, 49, 58, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
