import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [".next/", "out/", "stitch/", "next-env.d.ts", "**/.claude/worktrees/**"],
  },
];

export default eslintConfig;
