import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "scripts/**/*.test.cjs", ".source-checkpoints/**"] },
  plugins: [
    react(),
    {
      name: "copy-hand-runtime",
      closeBundle() {
        mkdirSync("dist/wasm", { recursive: true });
        copyFileSync("hand_landmarker.task", "dist/hand_landmarker.task");
        copyFileSync("face_landmarker.task", "dist/face_landmarker.task");
        cpSync("node_modules/@mediapipe/tasks-vision/wasm", "dist/wasm", { recursive: true });
      },
    },
  ],
  base: "./",
  build: { outDir: "dist" },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
