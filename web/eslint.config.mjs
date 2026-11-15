import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Colours, sizes, space, radii and shadows come from the design tokens (test/raw-values.test.ts has the same patterns).
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]", message: "No raw hex colour: use a design token (styles/tokens.css)." },
        { selector: "Literal[value=/(^|[\\s:])-?(text|bg|border|w|h|size|min-w|min-h|max-w|max-h|p[xytrbl]?|m[xytrbl]?|gap|space-[xy]|rounded|shadow|leading|tracking|fill|stroke)-\\[/]", message: "No arbitrary Tailwind value: add a token." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "lib/api/schema.d.ts"]),
]);
