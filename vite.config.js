import {defineConfig} from 'vite'
import {resolve} from 'path'

export default defineConfig({
    build: {
        target: 'esnext',
        lib: {
            formats: ['es'],
            name: "dittytoy",
            entry: resolve(__dirname, 'src/index.js'),
        }
    }
})