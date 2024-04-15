import {defineConfig} from 'vite'
import {resolve} from 'path'

export default defineConfig({
    build: {
        assetsInlineLimit: 409600,
        target: 'esnext',
        lib: {
            assetsInlineLimit: 409600,
            name: "dittytoy",
            entry: resolve(__dirname, 'src/index.js'),
        }
    }
})