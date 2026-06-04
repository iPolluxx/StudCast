import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// HMR over an ngrok tunnel is opt-in: set NGROK_HOST (your reserved domain) to route
// the HMR websocket through the tunnel. Without it, plain `npm run dev` uses normal
// localhost HMR — otherwise the client tries to reach a wss host it can't see locally
// and the page reload-loops.
const ngrokHost = process.env.NGROK_HOST

export default defineConfig({
  base: '/dashboard/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    allowedHosts: ['.ngrok-free.dev', '.ngrok.io'],
    ...(ngrokHost
      ? { hmr: { host: ngrokHost, protocol: 'wss', clientPort: 443 } }
      : {}),
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
