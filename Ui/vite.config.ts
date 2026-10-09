import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    //  路径别名：@ 指向 src 目录（ESM 兼容写法，不依赖 __dirname）
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    //  代理转发到 Python 后端（Server/api_server.py），rewrite 去掉 /api 前缀
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (路径) => 路径.replace(/^\/api/, ''),
      },
    },
  },
})
