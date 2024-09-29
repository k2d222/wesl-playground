import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
// import devtools from 'solid-devtools/vite';

export default defineConfig({
  plugins: [
    // devtools(),
    wasm(),
    topLevelAwait(),
    solid(),
  ],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
});
