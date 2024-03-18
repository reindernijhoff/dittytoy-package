import {defineConfig} from 'vite'

export default defineConfig({
    base: './',
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext'
        }
    },
    build: {
        target: 'esnext'
    }
})