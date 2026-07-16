// import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'
// import { visualizer } from 'rollup-plugin-visualizer'
// import deadFile from 'vite-plugin-deadfile'
import removeConsole from 'vite-plugin-remove-console'
import webfontDownload from 'vite-plugin-webfont-dl'
import { ViteEjsPlugin } from 'vite-plugin-ejs'
import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import 'dotenv/config'

import { E2E_SUBSCRIPTION_RESPONSE, getE2EAppConfig } from './e2e/fixtures/e2e-fixtures'

const isE2E = process.env.E2E === '1'
if (isE2E) {
    process.env.PANEL_DATA = Buffer.from(JSON.stringify(E2E_SUBSCRIPTION_RESPONSE)).toString(
        'base64'
    )
}

const e2eConfigPlugin = (): Plugin => {
    let version = 1
    return {
        name: 'e2e-app-config',
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (request.url?.startsWith('/__e2e/config-version')) {
                    version =
                        Number(
                            new URL(request.url, 'http://localhost').searchParams.get('value')
                        ) || 1
                    response.statusCode = 204
                    response.end()
                    return
                }
                if (!request.url?.startsWith('/assets/.app-config-v2.json')) {
                    next()
                    return
                }

                const etag = `"e2e-${version}"`
                response.setHeader('ETag', etag)
                response.setHeader('Cache-Control', 'private, no-cache, must-revalidate')
                if (request.headers['if-none-match'] === etag) {
                    response.statusCode = 304
                    response.end()
                    return
                }

                response.setHeader('Content-Type', 'application/json')
                response.end(JSON.stringify(getE2EAppConfig(version)))
            })
        }
    }
}

export default defineConfig({
    plugins: [
        react(),
        ...(isE2E ? [e2eConfigPlugin()] : []),
        removeConsole(),
        webfontDownload(undefined, {}),
        ViteEjsPlugin((viteConfig) => {
            if (process.env.NODE_ENV === 'production') {
                return {
                    root: viteConfig.root,
                    panelData: '<%= panelData %>',
                    metaDescription: '<%= metaDescription %>',
                    metaTitle: '<%= metaTitle %>'
                }
            }
            return {
                root: viteConfig.root,
                panelData: process.env.PANEL_DATA,
                metaDescription: process.env.META_DESCRIPTION,
                metaTitle: process.env.META_TITLE
            }
        })
    ],
    optimizeDeps: {
        include: ['html-parse-stringify']
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
        rollupOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: 'icons',
                            test: /node_modules[\\/](react-icons|@tabler[\\/]icons-react)[\\/]/
                        },
                        {
                            name: 'date',
                            test: /node_modules[\\/]dayjs[\\/]/
                        },
                        {
                            name: 'react',
                            test: /node_modules[\\/](react|zustand|react-dom|react-router|react-error-boundary)[\\/]/
                        },
                        {
                            name: 'mantine',
                            test: /node_modules[\\/]@mantine[\\/](core|hooks|nprogress|notifications|modals)[\\/]/
                        },
                        {
                            name: 'i18n',
                            test: /node_modules[\\/](i18next-browser-languagedetector|@remnawave[\\/](backend-contract|subscription-page-types))[\\/]/
                        }
                    ]
                }
            }
        }
    },
    server: {
        host: '0.0.0.0',
        port: 3334,
        cors: false,
        strictPort: true,
        allowedHosts: true
    },
    resolve: { tsconfigPaths: true }
})
