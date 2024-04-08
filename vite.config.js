import {defineConfig} from 'vite'
import {resolve} from 'path'
import dts from "vite-plugin-dts";

export default defineConfig({
    plugins: [
        dts({
            insertTypesEntry: true,
        }),
    ],
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