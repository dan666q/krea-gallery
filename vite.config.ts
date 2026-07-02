import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from the current directory
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'https://www.krea.ai',
          changeOrigin: true,
          secure: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req, _res) => {
              // Inject the session cookie from the local environment variable
              const cookie = env.KREA_SESSION_COOKIE || process.env.KREA_SESSION_COOKIE;
              if (cookie) {
                proxyReq.setHeader('Cookie', cookie);
              }
              // Set User-Agent to mimic a real browser request to bypass basic scraper blocks
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            });
          }
        }
      }
    }
  }
})

