import {defineConfig} from 'vite'
import {resolve} from 'path'

export default defineConfig({
    build: {
        lib: {
            name: "dittytoy",
            entry: resolve(__dirname, 'src/index.js'),
        }
    }
})