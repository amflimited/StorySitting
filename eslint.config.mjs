import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "ios/**",
    "marketing-site/**",
    "next-env.d.ts"
  ]),
  {
    // These files are the pre-v2 editorial console and capsule pipeline. Their
    // Supabase JSON boundaries intentionally remain dynamic until that legacy
    // surface receives its own typed-schema migration.
    files: [
      "app/launch-manifest/**/*.tsx",
      "app/staff/**/*.ts",
      "app/staff/**/*.tsx",
      "app/story-capsules/**/*.tsx",
      "lib/capsule-*.ts"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
]);
