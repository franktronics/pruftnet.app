/**
 * Regenerates every application icon from a single drawing.
 * Requires `rsvg-convert` (librsvg) and, for the .icns, macOS `iconutil`.
 *
 *   pnpm --filter @repo/desktop generate-icons
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const out = (...segments: string[]) => join(root, ...segments)

// Derived from the app theme (packages/ui/src/styles/main.css, hue 255).
const palette = { tile: '#17171a', bottom: '#0074e3', middle: '#4699fe', top: '#a8ceff' }

type Variant = {
    /** SVG viewBox. The drawing lives in a 100x100 space with the tile on 10..90. */
    viewBox: string
    /** Corner radius of the tile; 0 lets the OS apply its own mask. */
    radius: number
    /** Soft shadow baked in, as macOS expects. */
    shadow?: boolean
}

// macOS grid: the body fills 80% of the canvas, leaving room for the shadow.
const macOS: Variant = { viewBox: '0 0 100 100', radius: 18, shadow: true }
// Windows, Linux scalable and favicons: the tile fills the canvas.
const fullBleed: Variant = { viewBox: '10 10 80 80', radius: 18 }
// iOS masks the icon itself, so transparent corners would turn black.
const square: Variant = { viewBox: '10 10 80 80', radius: 0 }

const svg = ({
    viewBox,
    radius,
    shadow,
}: Variant) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
${shadow ? '<defs><filter id="s" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35"/></filter></defs>' : ''}
<rect x="10" y="10" width="80" height="80" rx="${radius}" fill="${palette.tile}"${shadow ? ' filter="url(#s)"' : ''}/>
<g stroke="${palette.tile}" stroke-width="3" stroke-linejoin="round">
<polygon points="50,53 76,66 50,79 24,66" fill="${palette.bottom}"/>
<polygon points="50,39 76,52 50,65 24,52" fill="${palette.middle}"/>
<polygon points="50,25 76,38 50,51 24,38" fill="${palette.top}"/>
</g>
</svg>
`

const workDir = mkdtempSync(join(tmpdir(), 'pruftnet-icons-'))
const sources = new Map<Variant, string>()

const sourceOf = (variant: Variant) => {
    let path = sources.get(variant)
    if (path === undefined) {
        path = join(workDir, `source-${sources.size}.svg`)
        writeFileSync(path, svg(variant))
        sources.set(variant, path)
    }
    return path
}

const png = (variant: Variant, size: number, target: string) => {
    mkdirSync(dirname(target), { recursive: true })
    execFileSync('rsvg-convert', [
        '-w',
        String(size),
        '-h',
        String(size),
        '-o',
        target,
        sourceOf(variant),
    ])
}

/** Packs PNG-encoded images into an .ico container (supported since Windows Vista). */
const ico = (variant: Variant, sizes: number[], target: string) => {
    const images = sizes.map((size) => {
        const file = join(workDir, `ico-${size}.png`)
        png(variant, size, file)
        return execFileSync('cat', [file])
    })
    const header = Buffer.alloc(6 + 16 * images.length)
    header.writeUInt16LE(1, 2)
    header.writeUInt16LE(images.length, 4)
    let offset = header.length
    images.forEach((image, index) => {
        const entry = 6 + 16 * index
        const size = sizes[index]!
        header.writeUInt8(size >= 256 ? 0 : size, entry)
        header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
        header.writeUInt16LE(1, entry + 4)
        header.writeUInt16LE(32, entry + 6)
        header.writeUInt32LE(image.length, entry + 8)
        header.writeUInt32LE(offset, entry + 12)
        offset += image.length
    })
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, Buffer.concat([header, ...images]))
}

const icns = (target: string) => {
    const iconset = join(workDir, 'icon.iconset')
    mkdirSync(iconset)
    for (const base of [16, 32, 128, 256, 512]) {
        png(macOS, base, join(iconset, `icon_${base}x${base}.png`))
        png(macOS, base * 2, join(iconset, `icon_${base}x${base}@2x.png`))
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', target])
}

try {
    const windowsSizes = [16, 24, 32, 48, 64, 128, 256]
    const faviconSizes = [16, 32, 48]

    // Desktop packaging
    png(macOS, 1024, out('apps/desktop/assets/icons/icon.png'))
    ico(fullBleed, windowsSizes, out('apps/desktop/assets/icons/icon.ico'))
    if (process.platform === 'darwin') icns(out('apps/desktop/assets/icons/icon.icns'))
    writeFileSync(out('apps/desktop/assets/icons/icon.svg'), svg(fullBleed))

    // Favicons for the desktop renderer and the website
    for (const dir of ['apps/desktop/assets/favicon', 'apps/site/public']) {
        ico(fullBleed, faviconSizes, out(dir, 'favicon.ico'))
        png(fullBleed, 32, out(dir, 'favicon-32.png'))
        png(square, 180, out(dir, 'apple-touch-icon.png'))
    }
    png(fullBleed, 512, out('apps/desktop/assets/favicon/icon-512.png'))

    // In-app titlebar logo
    png(fullBleed, 256, out('packages/front/src/assets/pruftnet-icon.png'))
} finally {
    rmSync(workDir, { recursive: true, force: true })
}
