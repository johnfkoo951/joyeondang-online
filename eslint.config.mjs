import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 함께 걷기 서버는 따로 묶는 Cloudflare Worker(자체 tsconfig·package.json)
    "game-server/**",
    // 손으로 돌리는 측정 스크립트(브라우저 안에서 도는 코드 조각이 섞여 있다)
    "private/tools/walk-probe/**",
  ]),
]);

export default eslintConfig;
