import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
      rollupOptions: {
        external: [
          'uiohook-napi',
          'better-sqlite3',
          'sqlite-vec',
          'onnxruntime-node',
          'onnxruntime-common',
          'sharp',
          'active-win',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      sourcemap: true,
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [tailwindcss(), react()],
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          'main-window': resolve(__dirname, 'src/renderer/main-window.html'),
        },
      },
    },
  },
})
