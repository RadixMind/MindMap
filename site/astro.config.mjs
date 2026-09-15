import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'

export default defineConfig({
  site: 'https://mindmap.u14.app',
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      sourcemap: true,
    },
  },
})
