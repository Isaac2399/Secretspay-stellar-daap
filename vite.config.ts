import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { authApiPlugin } from './server/authPlugin.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const passThrough = [
    'SESSION_SECRET',
    'SPONSOR_SECRET_KEY',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'VITE_STELLAR_NETWORK',
    'VITE_HORIZON_URL',
    'VITE_NETWORK_PASSPHRASE',
    'VITE_LOYALTY_CODE',
    'VITE_LOYALTY_ISSUER',
    'LOYALTY_CODE',
    'LOYALTY_ISSUER',
    'VITE_USDC_CODE',
    'VITE_USDC_ISSUER',
    'SEP24_HOME_DOMAIN',
    'VITE_SEP24_HOME_DOMAIN',
    'SEP24_CLIENT_DOMAIN',
    'SEP24_CLIENT_SIGNING_SECRET',
    'SUPER_ADMIN_EMAIL',
    'SUPER_ADMIN_PUBLIC_KEY',
    'SUPER_ADMIN_SEED',
    'CARD_TREASURY_SECRET_KEY',
    'CARD_DAILY_LIMIT_USD',
    'CARD_PROVIDER',
    'RAIN_API_KEY',
    'RAIN_API_BASE_URL',
    'NEXT_PUBLIC_STELLAR_NETWORK',
    'NEXT_PUBLIC_HORIZON_URL',
    'NEXT_PUBLIC_LOYALTY_CODE',
    'NEXT_PUBLIC_LOYALTY_ISSUER',
  ] as const
  for (const key of passThrough) {
    if (env[key]) {
      process.env[key] = env[key]
    }
  }

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss(), authApiPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      // Stellar SDK + map/QR keep the main chunk large; this is a warning only.
      chunkSizeWarningLimit: 1600,
    },
  }
})
