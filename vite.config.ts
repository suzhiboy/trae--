import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api 代理到可选的本地 AI 兜底服务；服务未启动时请求失败，前端会静默保留规则诊断。
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
});
