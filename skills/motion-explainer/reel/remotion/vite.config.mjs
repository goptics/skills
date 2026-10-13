// Vite config for the Remotion slide deck (deck/). The renderer writes deck/public/props.json before serving or building.
import { defineConfig } from "vite";

export default defineConfig({
  root: "deck",
  base: "./",
  oxc: { jsx: { runtime: "automatic" } },   // React 17+ JSX, no plugin needed
  server: { fs: { allow: [".."] } },          // core.mjs, motion.mjs live one folder up
  build: { outDir: process.env.DECK_OUT ?? "dist", emptyOutDir: true },
});
