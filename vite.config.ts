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
        background_color: '#f5efe3',
        theme_color: '#b3441a',
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
        navigateFallback: '/index.html',
        // Le chunk exceljs (~940 Ko) doit être précaché pour l'export hors ligne.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Purge les précaches des versions précédentes : un vieux service
        // worker ne doit jamais servir un bundle qui n'existe plus (écran blanc).
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
})
