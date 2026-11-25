/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // GitHub Pages（/madoriApp/ 配下）でも、リポジトリ名変更・独自ドメイン・ローカル preview でも動くよう相対パスにする
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // 過去の版の移行検証は npm run test:archive（vitest.archive.config.ts）で回す
    exclude: ['**/node_modules/**', '**/*.archive.test.ts'],
    // GEN_VERSION 5 でクローゼットのモード（弱・強）が候補の列挙に入り、プール構築が約2倍になった。
    // 全プールを走査するテストが並列実行の負荷で 5 秒の既定を超えないよう、既定を延ばす
    testTimeout: 30_000,
  },
})
