import { defineConfig } from 'vite';
import { resolve } from 'path';

const isLibBuild = process.env.BUILD_MODE === 'lib';

// Backend target for the proxy — configurable via BACKEND_URL env var.
// Default: http://localhost:8080 (same machine as the frontend server).
// The browser NEVER talks to this address directly; Vite proxies all /api/* calls here.
const BACKEND_TARGET = process.env.BACKEND_URL || 'http://localhost:8080';

export default defineConfig({

  // ── Library build: npm run build:lib ────────────────────────────────────────
  ...(isLibBuild && {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/core/KuberPlayer.ts'),
        name: 'KuberPlayer',
        fileName: (format) => `kuber-player.${format}.js`,
      },
      rollupOptions: {
        external: ['hls.js'],
        output: {
          globals: { 'hls.js': 'Hls' },
          assetFileNames: 'kuber-player.[ext]',
        },
      },
    },
  }),

  // ── Sandbox app build: npm run build ────────────────────────────────────────
  ...(!isLibBuild && {
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }),

  // ── Dev server ──────────────────────────────────────────────────────────────
  server: {
    host: '0.0.0.0',     // Bind all interfaces: localhost + LAN + VPS + tunnels
    port: 3000,
    strictPort: true,
    cors: true,
    allowedHosts: true,  // Accept any Host header (Cloudflare tunnel, ngrok, etc.)

    // ── API Proxy ──────────────────────────────────────────────────────────────
    // All /api/* requests from the browser are silently forwarded to the backend.
    // This means:
    //   • You only need ONE public URL / tunnel (port 3000).
    //   • The backend (port 8080) stays 100% private — never exposed to the internet.
    //   • Works with Cloudflare Tunnel, ngrok, localtunnel, or any reverse proxy.
    //   • CORS is handled automatically — the browser thinks everything is same-origin.
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,     // Rewrites the Host header to match the backend
        secure: false,          // Allow self-signed certs if backend is HTTPS
        ws: false,              // Websockets handled separately (SSE is HTTP)

        // ── Keep streaming connections alive ─────────────────────────────────
        // Required for:
        //   • SSE  (/api/v1/logs)       — live server log stream
        //   • Video (/api/v1/video/raw) — large byte-range file streaming
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Preserve Range header for video byte-range seeking
            if (req.headers['range']) {
              proxyReq.setHeader('range', req.headers['range']);
            }
          });

          proxy.on('error', (err, req, res) => {
            console.error(`[proxy] Error forwarding ${req.url} → ${BACKEND_TARGET}:`, err.message);
            if (!res.headersSent) {
              (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              (res as any).end(JSON.stringify({
                error: 'Backend unreachable',
                detail: `Cannot connect to ${BACKEND_TARGET}. Is the backend running?`,
              }));
            }
          });
        },
      },
    },
  },

  // ── Preview server (after npm run build) ────────────────────────────────────
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    cors: true,
  },
});