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
            { name: 'antd-core', test: /node_modules[\\/]antd[\\/]es[\\/]_(?:util|shared)[\\/]/ },
            { name: 'antd-icons', test: /node_modules[\\/]@ant-design[\\/](?:icons|icons-svg)[\\/]/ },
            { name: 'antd-data-entry', test: /node_modules[\\/]antd[\\/]es[\\/](?:auto-complete|cascader|checkbox|color-picker|date-picker|form|input|input-number|mentions|radio|rate|select|slider|switch|time-picker|transfer|tree-select|upload)[\\/]/ },
            { name: 'antd-data-display', test: /node_modules[\\/]antd[\\/]es[\\/](?:avatar|badge|calendar|card|carousel|collapse|descriptions|empty|image|list|popover|qrcode|statistic|table|tag|timeline|tooltip|tree)[\\/]/ },
            { name: 'antd-feedback', test: /node_modules[\\/]antd[\\/]es[\\/](?:alert|drawer|message|modal|notification|popconfirm|progress|result|skeleton|spin)[\\/]/ },
            { name: 'antd-navigation', test: /node_modules[\\/]antd[\\/]es[\\/](?:anchor|breadcrumb|dropdown|menu|pagination|steps|tabs)[\\/]/ },
            { name: 'antd-layout', test: /node_modules[\\/]antd[\\/]es[\\/](?:app|button|divider|flex|float-button|grid|layout|space|splitter|typography)[\\/]/ },
            { name: 'antd-vendor', test: /node_modules[\\/]antd[\\/]/ },
            { name: 'rc-vendor', test: /node_modules[\\/](?:@rc-component|rc-[^\\/]+)[\\/]/ },
            { name: 'query-vendor', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'i18n-vendor', test: /node_modules[\\/](?:i18next|react-i18next)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: './src/test/setup.ts',
    globals: false,
    css: true,
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 35,
        branches: 30,
        functions: 30,
        lines: 35,
      },
    },
  },
})
