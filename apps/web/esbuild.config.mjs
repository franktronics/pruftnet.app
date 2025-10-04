import { build } from 'esbuild'

const mode = process.env.NODE_ENV || 'production'

try {
    await build({
        entryPoints: ['src/server.ts'],
        outdir: 'dist/server',
        platform: 'node',
        format: 'esm',
        target: ['node18'],
        bundle: true,
        packages: 'external',
        sourcemap: true,
        define: {
            'process.env.NODE_ENV': JSON.stringify(mode),
        },
        logLevel: 'info',
        //minify: true,
    })
    console.log(`ESBuild: (mode=${mode})`)
} catch (err) {
    console.error('esbuild: échec du build serveur')
    console.error(err)
    process.exit(1)
}
