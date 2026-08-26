/** @type {import('tailwindcss').Config} */
// NativeWind 4 는 Tailwind 3 기반이다. 웹(src/app/globals.css)은 Tailwind 4 의
// @theme inline 문법을 쓰므로 문법은 다르지만, 클래스명은 동일하게 맞춘다.
// 웹 UI 를 포팅할 때 className 을 그대로 옮길 수 있게 하는 것이 목적.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // 웹 globals.css 의 SUAZA design tokens 과 1:1 대응
        "suaza-bg": "#fafafa",
        "suaza-ink": "#121726",
        "suaza-ink-muted": "#737a8c",
        "suaza-ink-faint": "#8c94a6",
        "suaza-button": "#1d2e3e",
        "suaza-accent": "#ef3e3e",
        "suaza-border": "#d9d9d9",
        "suaza-divider": "#e0e3eb",
        "suaza-placeholder": "#b3b3b3",
      },
    },
  },
  plugins: [],
};
