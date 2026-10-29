import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // CORS 또는 Mixed Content 문제가 생길 때 사용할 개발용 프록시
    // .env 에 VITE_ISS_API_URL=/iss-api/iss-now.json 을 지정하면 이 경로를 통해 요청합니다.
    proxy: {
      '/iss-api': {
        target: 'http://api.open-notify.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/iss-api/, ''),
      },
    },
  },
});
