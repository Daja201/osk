import { defineConfig } from "vitest/config";

// Vitest spouští jen naše testy v tests/. Davidovy testy v lib/citiq/ používají node:test
// a spouští je druhá část skriptu "test" v package.json.
export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
