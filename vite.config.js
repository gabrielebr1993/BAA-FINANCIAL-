import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'MilePay — Gestión de facturas',
        short_name: 'MilePay',
        description: 'MilePay: gestión de facturas de reparto — verificación con Gofo, pagos a choferes y rendimiento por ciudad.',
        theme_color: '#13233f',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // El nuevo SW toma control de inmediato y limpia cachés viejas: así nadie
        // se queda pegado en un bundle antiguo (causa de "borrado lento" y de
        // llamadas fantasma a /api/crear-usuario que ya no existen en el código).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Nunca servir /api/* desde el SW (endpoints serverless siempre a la red).
        navigateFallbackDenylist: [/^\/__/, /^\/api\//],
      },
    }),
  ],
})
