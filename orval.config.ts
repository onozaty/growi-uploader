import { defineConfig } from "orval";

export default defineConfig({
  growi: {
    input: "./growi-openapi.json",
    output: "./src/generated/growi.ts",
    hooks: {
      afterAllFilesWrite: "prettier --write",
    },
  },
});
