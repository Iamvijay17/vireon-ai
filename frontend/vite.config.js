import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to all network interfaces so the dev server is reachable from
    // other devices on the same LAN (e.g. your laptop).
    host: true,
  },
  resolve: {
    // vireon-remotion-templates is raw (unbuilt) workspace source shared
    // with backend/remotion, not a prebuilt library — dedupe forces every
    // import of these to resolve to frontend's own single copy, however
    // deep the importing file lives (backend/remotion/src/templates/*).
    // Without this, @remotion/player's bundled copy of "remotion" and the
    // templates' own copy end up as two separate module instances, which
    // breaks the video-config React context Player relies on.
    dedupe: ["react", "react-dom", "remotion"],
  },
  optimizeDeps: {
    // Exclude the workspace source package from esbuild pre-bundling so
    // Vite treats its .jsx files as ordinary project source (JSX transform
    // + HMR) instead of repeatedly "discovering" it as a new dependency to
    // optimize, which was causing stale optimize-deps hash 504s.
    exclude: ["vireon-remotion-templates"],
  },
  test: {
    // jsdom, not node: the units worth testing here are hooks and pure
    // helpers, and the hooks need a DOM to render into.
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
    // Keep the Remotion workspace source out of the test run - it has its
    // own suite and pulling it in drags the whole player bundle into
    // every test file's module graph.
    exclude: ["node_modules/**", "dist/**", "**/vireon-remotion-templates/**"],
  },
})
