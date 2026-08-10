import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ },
            { name: 'antd-vendor', test: /node_modules[\\/](?:antd|@ant-design)[\\/]/, maxSize: 420_000 },
            { name: 'rc-vendor', test: /node_modules[\\/]rc-[^\\/]+[\\/]/, maxSize: 420_000 },
            { name: 'query-vendor', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'i18n-vendor', test: /node_modules[\\/](?:i18next|react-i18next)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: false,
    css: true,
    testTimeout: 20_000,
  },
})
