/**
 * Regenerates every application icon and the macOS installer background from a single drawing.
 * Requires `rsvg-convert` (librsvg) and, for the .icns, macOS `iconutil`.
 *
 *   pnpm --filter @repo/desktop generate-icons
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const out = (...segments: string[]) => join(root, ...segments)

// Derived from the app theme (packages/ui/src/styles/main.css, hue 255).
const palette = { tile: '#17171a', bottom: '#0074e3', middle: '#4699fe' }

type Channel = {
    /** Appended to every generated file name, matching `metadata().suffix` in scripts/distribution. */
    suffix: string
    /** Top layer of the mark: the only part that tells channels apart at small sizes. */
    top: string
    /** Installer accent (arrow, label) and the soft glow behind the title. */
    accent: string
    glow: string
    label?: string
}

const channels: Channel[] = [
    { suffix: '', top: '#a8ceff', accent: '#4699fe', glow: '#e7f0fd' },
    { suffix: '-nightly', top: '#ffc35a', accent: '#e8930c', glow: '#fdf1df', label: 'NIGHTLY' },
]

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

const mark = (
    channel: Channel,
) => `<g stroke="${palette.tile}" stroke-width="3" stroke-linejoin="round">
<polygon points="50,53 76,66 50,79 24,66" fill="${palette.bottom}"/>
<polygon points="50,39 76,52 50,65 24,52" fill="${palette.middle}"/>
<polygon points="50,25 76,38 50,51 24,38" fill="${channel.top}"/>
</g>`

const iconSvg = (
    channel: Channel,
    { viewBox, radius, shadow }: Variant,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
${shadow ? '<defs><filter id="s" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#000" flood-opacity="0.35"/></filter></defs>' : ''}
<rect x="10" y="10" width="80" height="80" rx="${radius}" fill="${palette.tile}"${shadow ? ' filter="url(#s)"' : ''}/>
${mark(channel)}
</svg>
`

// Finder lays the icons over the background at the positions declared in electron-builder.yml.
// The window takes the size of the 1x background, so the drawing must agree with that layout.
type DmgItem = { x: number; y: number; type: 'file' | 'link' }
const dmgConfig = parse(readFileSync(out('apps/desktop/electron-builder.yml'), 'utf8')).dmg as {
    iconSize: number
    contents: DmgItem[]
}
const dmgSize = { width: 660, height: 400 }
const font = `font-family="SF Pro Text, -apple-system, Helvetica Neue, Helvetica, Arial, sans-serif"`

const dmgBackgroundSvg = (channel: Channel) => {
    const { width, height } = dmgSize
    const [app, applications] = dmgConfig.contents as [DmgItem, DmgItem]
    const center = width / 2
    // The arrow spans the gap between both icons, on their vertical center.
    const arrowStart = app.x + dmgConfig.iconSize / 2 + 16 - center
    const arrowEnd = applications.x - dmgConfig.iconSize / 2 - 16 - center
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfc"/><stop offset="1" stop-color="#f0f1f4"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0" r="0.75"><stop offset="0" stop-color="${channel.glow}"/><stop offset="1" stop-color="${channel.glow}" stop-opacity="0"/></radialGradient>
<pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="${palette.tile}" fill-opacity="0.07"/></pattern>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.55" stop-color="#fff"/></linearGradient>
<mask id="lower"><rect width="${width}" height="${height}" fill="url(#fade)"/></mask>
</defs>
<rect width="${width}" height="${height}" fill="url(#base)"/>
<rect width="${width}" height="${height}" fill="url(#glow)"/>
<rect width="${width}" height="${height}" fill="url(#dots)" mask="url(#lower)"/>
<svg x="${center - 13}" y="26" width="26" height="26" viewBox="10 10 80 80">
<rect x="10" y="10" width="80" height="80" rx="18" fill="${palette.tile}"/>
${mark(channel)}
</svg>
<text x="${center}" y="${channel.label ? 68 : 72}" ${font} font-size="15" font-weight="600" text-anchor="middle" fill="#1d1d1f">Install Pruftnet</text>
${channel.label ? `<text x="${center}" y="86" ${font} font-size="10.5" font-weight="700" letter-spacing="1.4" text-anchor="middle" fill="${channel.accent}">${channel.label}</text>` : ''}
<g transform="translate(${center} ${app.y})" fill="none" stroke="${channel.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
<path d="M${arrowStart} 0 H${arrowEnd - 2}" stroke-dasharray="1 7"/>
<path d="M${arrowEnd - 12} -10 L${arrowEnd} 0 L${arrowEnd - 12} 10"/>
</g>
<text x="${center}" y="${app.y + 26}" ${font} font-size="11.5" text-anchor="middle" fill="#6e6e73">Drag to install</text>
<line x1="40" y1="${height - 52}" x2="${width - 40}" y2="${height - 52}" stroke="${palette.tile}" stroke-opacity="0.08"/>
<text x="${center}" y="${height - 28}" ${font} font-size="11" text-anchor="middle" fill="#86868b">Blocked on first launch? Open System Settings › Privacy &amp; Security › Open Anyway.</text>
</svg>
`
}

const workDir = mkdtempSync(join(tmpdir(), 'pruftnet-icons-'))
const sources = new Map<string, string>()

const sourceOf = (svg: string) => {
    let path = sources.get(svg)
    if (path === undefined) {
        path = join(workDir, `source-${sources.size}.svg`)
        writeFileSync(path, svg)
        sources.set(svg, path)
    }
    return path
}

const render = (svg: string, width: number, height: number, target: string) => {
    mkdirSync(dirname(target), { recursive: true })
    execFileSync('rsvg-convert', [
        '-w',
        String(width),
        '-h',
        String(height),
        '-o',
        target,
        sourceOf(svg),
    ])
}

const png = (svg: string, size: number, target: string) => render(svg, size, size, target)

/** Packs PNG-encoded images into an .ico container (supported since Windows Vista). */
const ico = (svg: string, sizes: number[], target: string) => {
    const images = sizes.map((size) => {
        const file = join(workDir, `ico-${size}.png`)
        png(svg, size, file)
        return readFileSync(file)
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

const icns = (svg: string, target: string) => {
    const iconset = join(workDir, `${basename(target, '.icns')}.iconset`)
    mkdirSync(iconset)
    for (const base of [16, 32, 128, 256, 512]) {
        png(svg, base, join(iconset, `icon_${base}x${base}.png`))
        png(svg, base * 2, join(iconset, `icon_${base}x${base}@2x.png`))
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', target])
}

try {
    const windowsSizes = [16, 24, 32, 48, 64, 128, 256]
    const faviconSizes = [16, 32, 48]

    // Desktop packaging and installer, one set per release channel
    for (const channel of channels) {
        const icons = (extension: string) =>
            out(`apps/desktop/assets/icons/icon${channel.suffix}.${extension}`)
        png(iconSvg(channel, macOS), 1024, icons('png'))
        ico(iconSvg(channel, fullBleed), windowsSizes, icons('ico'))
        if (process.platform === 'darwin') icns(iconSvg(channel, macOS), icons('icns'))
        writeFileSync(icons('svg'), iconSvg(channel, fullBleed))

        const background = dmgBackgroundSvg(channel)
        const { width, height } = dmgSize
        const dmg = (name: string) => out(`apps/desktop/assets/dmg/${name}`)
        render(background, width, height, dmg(`background${channel.suffix}.png`))
        render(background, width * 2, height * 2, dmg(`background${channel.suffix}@2x.png`))
    }

    const main = iconSvg(channels[0]!, fullBleed)
    // Favicons for the desktop renderer and the website
    for (const dir of ['apps/desktop/assets/favicon', 'apps/site/public']) {
        ico(main, faviconSizes, out(dir, 'favicon.ico'))
        png(main, 32, out(dir, 'favicon-32.png'))
        png(iconSvg(channels[0]!, square), 180, out(dir, 'apple-touch-icon.png'))
    }
    png(main, 512, out('apps/desktop/assets/favicon/icon-512.png'))

    // In-app titlebar logo
    png(main, 256, out('packages/front/src/assets/pruftnet-icon.png'))
} finally {
    rmSync(workDir, { recursive: true, force: true })
}
