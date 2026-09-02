import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      // Cosmetic; never catches real bugs in our codebase (mostly email templates and prose).
      "react/no-unescaped-entities": "off",
      // React Compiler hints in eslint-plugin-react-hooks@7 — keep as warnings,
      // not errors, because they flag many intentional patterns (count-up resets,
      // controlled state syncing, WebGL ref access during render, etc.).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "node_modules/**",
      "functions/lib/**",
      "_reference/**",
      "next-env.d.ts",
    ],
  },
];

export default config;
