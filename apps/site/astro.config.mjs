import node from '@astrojs/node'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'astro/config'

// The site advertises the version of the application it ships with (root package.json).
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

// Production builds bundle every runtime dependency into the server entry so the container image
// needs no node_modules. The dev server keeps Vite's default externals (CommonJS needs `require`).
const standaloneBundle = {
    name: 'pruftnet:standalone-bundle',
    hooks: {
        'astro:config:setup': ({ command, updateConfig }) => {
            if (command === 'build') updateConfig({ vite: { ssr: { noExternal: true } } })
        },
    },
}

export default defineConfig({
    site: 'https://pruftnet.app',
    output: 'static',
    adapter: node({ mode: 'standalone' }),
    integrations: [
        sitemap({ filter: (page) => !/\/(archive|404)\/?$/.test(page) }),
        standaloneBundle,
    ],
    redirects: {
        '/doc': 'https://github.com/franktronics/pruftnet.app#install',
    },
    server: { host: true, port: 4321 },
    devToolbar: { enabled: false },
    // Collapse whitespace like HTML does; the JSX-style default drops spaces between inline tags.
    compressHTML: true,
    vite: {
        plugins: [tailwindcss()],
        define: { 'import.meta.env.PRUFTNET_VERSION': JSON.stringify(version) },
    },
})
