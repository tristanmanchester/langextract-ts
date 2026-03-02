import { defineConfig } from "vitest/config";

const strictCoverage = process.env.LANGEXTRACT_STRICT_COVERAGE === "1";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts"],
      reporter: ["text", "json-summary", "html"],
      ...(strictCoverage
        ? {
            thresholds: {
              lines: 85,
              statements: 85,
              functions: 85,
              branches: 75,
              "src/public/extract.ts": {
                lines: 90,
                statements: 90,
                functions: 90,
                branches: 80,
              },
              "src/**/providers/**/*.ts": {
                lines: 90,
                statements: 90,
                functions: 90,
                branches: 80,
              },
              "src/internal/resolver/**/*.ts": {
                lines: 90,
                statements: 90,
                functions: 90,
                branches: 80,
              },
              "src/internal/prompting/**/*.ts": {
                lines: 90,
                statements: 90,
                functions: 90,
                branches: 80,
              },
            },
          }
        : {}),
    },
  },
});
