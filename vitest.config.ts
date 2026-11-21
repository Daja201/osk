import path from "path";
import { defineConfig } from "vitest/config";

// Vitest spouští jen naše testy v tests/. Alias @/ jako v Next (tsconfig), aby šly testovat i route handlery v app/.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
