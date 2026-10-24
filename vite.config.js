import { defineConfig } from 'vite';

export default defineConfig({
  // Relative, so the build works from a repository subpath on GitHub Pages
  // as well as from the root of a plain static host.
  base: './',
  build: { chunkSizeWarningLimit: 4000 },
});
