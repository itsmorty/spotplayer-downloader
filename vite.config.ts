import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs keep the build working under a GitHub Pages project
  // subpath (e.g. /spotplayer-downloader/) without hard-coding the repo name.
  base: './',
  plugins: [tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
