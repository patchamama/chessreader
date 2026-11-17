import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Stockfish 18 (lite, single-threaded WebAssembly) from the `stockfish` npm
// package, served by this site under /stockfish/ — the CDNs refuse the package
// (over their size limit). Dev serves the files from node_modules; the build
// copies them next to the app.
const STOCKFISH_FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']
function stockfishAssets(): Plugin {
  const require = createRequire(import.meta.url)
  const dir = join(dirname(require.resolve('stockfish/package.json')), 'bin')
  return {
    name: 'stockfish-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].split('/stockfish/')[1]
        if (!name || !STOCKFISH_FILES.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(join(dir, name)))
      })
    },
    generateBundle() {
      for (const name of STOCKFISH_FILES) this.emitFile({ type: 'asset', fileName: `stockfish/${name}`, source: readFileSync(join(dir, name)) })
    },
  }
}

// In dev the frontend calls the API with relative paths ("/api/..."), so we
// proxy those to the PHP backend. Override the target with VITE_API_TARGET.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080'

// VITE_BASE_PATH lets the GitHub Pages deploy set the repo sub-path,
// e.g. /chessreader/ for https://patchamama.github.io/chessreader/
const basePath = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: basePath,
  plugins: [react(), stockfishAssets()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
