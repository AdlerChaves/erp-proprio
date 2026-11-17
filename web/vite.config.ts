/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, /api vai para a API na mesma origem do frontend, como em produção com o nginx.
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/teste/configuracao.ts'],
    // Testes de tela digitam e clicam como o usuário; sob carga, o limite padrão de 5 s não basta.
    testTimeout: 15_000,
    css: false,
  },
});
