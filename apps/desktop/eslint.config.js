import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "dist-private-web",
      ".vercel",
      "public/ocr",
      "node_modules",
      "src-tauri/target",
      "src-tauri/gen",
      ".tmp",
      "output",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "server/**/*.mjs", "api/**/*.mjs", "tradingview/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly", URLSearchParams: "readonly", Buffer: "readonly", fetch: "readonly", Request: "readonly", Response: "readonly", AbortSignal: "readonly", setTimeout: "readonly", clearTimeout: "readonly" },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        Blob: "readonly",
        ClipboardItem: "readonly",
        FileReader: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLTextAreaElement: "readonly",
        URL: "readonly",
        console: "readonly",
        document: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        performance: "readonly",
        sessionStorage: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly",
        window: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": "off",
    },
  },
);
