import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// open-notify API 는 http 만 지원하므로 개발/미리보기 서버가 대신 요청해 전달한다.
const proxy = {
  '/iss-api': {
    target: 'http://api.open-notify.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/iss-api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, proxy },
  preview: { port: 3000, proxy },
});
