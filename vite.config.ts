import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    // En dev, la page Admin appelle les fonctions serveur du déploiement.
    proxy: {
      '/api': {
        target: 'https://collecte-taupe.vercel.app',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Collecte — carnet de collecte de données',
        short_name: 'Collecte',
        description:
          'Composez vos questionnaires et collectez des données sur le terrain, même hors ligne.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        background_color: '#060b1c',
        theme_color: '#060b1c',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Le chunk exceljs (~940 Ko) doit être précaché pour l'export hors ligne.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Purge les précaches des versions précédentes : un vieux service
        // worker ne doit jamais servir un bundle qui n'existe plus (écran blanc).
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // PAS de navigateFallback (cache-first) : le HTML servi doit toujours
        // être le plus récent, sinon il réclame un bundle supprimé après un
        // déploiement → page vide. Réseau d'abord, cache en secours hors ligne.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-navigations',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8 },
            },
          },
        ],
      },
    }),
  ],
})
