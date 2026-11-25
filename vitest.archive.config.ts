import { defineConfig } from 'vitest/config'

// 過去の版の移行検証・標本の記録の検査（*.archive.test.ts）だけを回す設定。通常の npm test（vite.config.ts）には入れない
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.archive.test.ts'],
    testTimeout: 30_000,
  },
})
