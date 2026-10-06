import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      // jsPDF's optional .html() renderer dynamically imports these — we only use
      // jsPDF + jspdf-autotable for text-based PDFs and never call .html(), so drop
      // them from the bundle instead of shipping unused dead code.
      external: ['html2canvas', 'dompurify'],
    },
  },
})
