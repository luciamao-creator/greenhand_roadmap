/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  corePlugins: {
    // 基础 reset 由 globals.css 自定义规则承担，避免 preflight 与既有视觉冲突
    preflight: true,
  },
  theme: {
    extend: {
      colors: {
        ink: "#122018",
        muted: "#6b7a70",
        primary: "#1d7c57",
        "primary-soft": "#e6f4ee",
      },
    },
  },
  plugins: [],
};
