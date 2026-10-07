import { Data, Effect, Schema, SynchronizedRef } from 'effect'

import { compareAssets, parseReleaseAsset, type ReleaseAsset, type ReleaseFile } from './assets'

const REPOSITORY = 'franktronics/pruftnet.app'
const API = `https://api.github.com/repos/${REPOSITORY}`
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
/** The last release of the archived 0.1 application (branch dev-archive). It never changes. */
export const LEGACY_RELEASE = { version: '0.1.2', url: `${RELEASES_URL}/tag/v0.1.2` } as const
const CACHE_TTL_MS = 15 * 60 * 1000
const REQUEST_TIMEOUT = '6 seconds'

const GithubAsset = Schema.Struct({
    name: Schema.String,
    size: Schema.Number,
    browser_download_url: Schema.String,
    digest: Schema.optional(Schema.NullOr(Schema.String)),
})

const GithubRelease = Schema.Struct({
    tag_name: Schema.String,
    name: Schema.NullOr(Schema.String),
    html_url: Schema.String,
    draft: Schema.Boolean,
    prerelease: Schema.Boolean,
    published_at: Schema.NullOr(Schema.String),
    assets: Schema.Array(GithubAsset),
})
type GithubRelease = typeof GithubRelease.Type

export class ReleaseCatalogError extends Data.TaggedError('ReleaseCatalogError')<{
    readonly reason: 'request' | 'status' | 'decode'
    readonly message: string
}> {}

export interface ReleaseSummary {
    tag: string
    version: string
    title: string
    url: string
    publishedAt: string | null
}

export interface Release extends ReleaseSummary {
    assets: ReleaseAsset[]
    checksumsUrl: string | null
}

export interface ReleaseCatalog {
    stable: Release | null
    /** Only summarized: the page links nightly builds to GitHub instead of listing them. */
    nightly: ReleaseSummary | null
    fetchedAt: string
    /** True when GitHub failed and the previous successful snapshot is served instead. */
    stale: boolean
}

const githubHeaders = (): HeadersInit => {
    const token = process.env.GITHUB_TOKEN
    return {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pruftnet-site',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
}

const requestJson = (path: string) =>
    Effect.tryPromise({
        try: (signal) => fetch(`${API}${path}`, { headers: githubHeaders(), signal }),
        catch: (cause) =>
            new ReleaseCatalogError({ reason: 'request', message: `GitHub ${path}: ${cause}` }),
    }).pipe(
        Effect.timeoutFail({
            duration: REQUEST_TIMEOUT,
            onTimeout: () =>
                new ReleaseCatalogError({ reason: 'request', message: `GitHub ${path}: timeout` }),
        }),
        Effect.flatMap((response) =>
            response.ok
                ? Effect.promise(() => response.json() as Promise<unknown>)
                : Effect.fail(
                      new ReleaseCatalogError({
                          reason: 'status',
                          message: `GitHub ${path}: HTTP ${response.status}`,
                      }),
                  ),
        ),
    )

const decode =
    <A, I>(schema: Schema.Schema<A, I>, path: string) =>
    (value: unknown) =>
        Schema.decodeUnknown(schema)(value).pipe(
            Effect.mapError(
                (error) =>
                    new ReleaseCatalogError({
                        reason: 'decode',
                        message: `${path}: ${error.message}`,
                    }),
            ),
        )

const fetchRelease = (path: string) =>
    requestJson(path).pipe(Effect.flatMap(decode(GithubRelease, path)))

const fetchRecentReleases = requestJson('/releases?per_page=30').pipe(
    Effect.flatMap(decode(Schema.Array(GithubRelease), '/releases')),
)

const toFile = (asset: GithubRelease['assets'][number]): ReleaseFile => ({
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    sha256: asset.digest?.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : null,
})

const summarize = (release: GithubRelease): ReleaseSummary => ({
    tag: release.tag_name,
    version: release.tag_name.replace(/^v/, ''),
    title: release.name || release.tag_name,
    url: release.html_url,
    publishedAt: release.published_at,
})

export function toRelease(release: GithubRelease): Release {
    const files = release.assets.map(toFile)
    return {
        ...summarize(release),
        assets: files
            .map(parseReleaseAsset)
            .filter((asset) => asset !== null)
            .sort(compareAssets),
        checksumsUrl: files.find((file) => file.name === 'SHA256SUMS')?.url ?? null,
    }
}

const isNightly = (release: GithubRelease) =>
    !release.draft && release.prerelease && release.tag_name.includes('-nightly.')

// A missing release (404) is a normal state, e.g. before the first nightly is published.
const optional = <A>(effect: Effect.Effect<A, ReleaseCatalogError>) =>
    effect.pipe(
        Effect.map((value): A | null => value),
        Effect.catchIf(
            (error) => error.reason === 'status' && error.message.endsWith('HTTP 404'),
            () => Effect.succeed(null),
        ),
    )

const loadCatalog = Effect.all(
    {
        stable: optional(fetchRelease('/releases/latest')).pipe(
            Effect.map((release) => release && toRelease(release)),
        ),
        // The list is newest first; nightlies are prereleases and never become "latest".
        nightly: fetchRecentReleases.pipe(
            Effect.map((releases) => releases.find(isNightly)),
            Effect.map((release) => (release ? summarize(release) : null)),
        ),
    },
    { concurrency: 'unbounded' },
).pipe(
    Effect.map(
        (releases): ReleaseCatalog => ({
            ...releases,
            fetchedAt: new Date().toISOString(),
            stale: false,
        }),
    ),
)

interface CacheEntry {
    catalog: ReleaseCatalog
    expiresAt: number
}

const cache = SynchronizedRef.unsafeMake<CacheEntry | null>(null)

/**
 * Serves the release catalog from a 15 minute cache. Concurrent callers share one refresh, and a
 * failed refresh falls back to the last good snapshot (marked stale) instead of an error page.
 */
export const getReleaseCatalog = SynchronizedRef.modifyEffect(cache, (entry) => {
    if (entry && entry.expiresAt > Date.now()) return Effect.succeed([entry.catalog, entry])
    return loadCatalog.pipe(
        Effect.map((catalog) => {
            const next = { catalog, expiresAt: Date.now() + CACHE_TTL_MS }
            return [catalog, next] as const
        }),
        Effect.catchAll((error) => {
            if (!entry) return Effect.fail(error)
            // Retry a failed refresh after one minute rather than hammering GitHub on every request.
            const retry = { catalog: entry.catalog, expiresAt: Date.now() + 60_000 }
            return Effect.logWarning(error.message).pipe(
                Effect.as([{ ...entry.catalog, stale: true }, retry] as const),
            )
        }),
    )
})
