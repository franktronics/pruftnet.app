import { appendFileSync, readFileSync } from 'node:fs'
import { run } from './common.mjs'
const ref = run('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' })
let channel = 'main'
let version
let publish = true

/** True when `ref` is the merge commit of a PR merged into dev, not a direct push. */
async function isMergedPullRequestCommit() {
    const response = await fetch(
        `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/commits/${ref}/pulls`,
        {
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Bearer ${process.env.GH_TOKEN}`,
            },
        },
    )
    if (!response.ok) throw new Error(`Unable to list PRs for ${ref}: HTTP ${response.status}`)
    const pulls = await response.json()
    return pulls.some(
        (pull) => pull.merged_at && pull.base.ref === 'dev' && pull.merge_commit_sha === ref,
    )
}

if (process.env.GITHUB_REF === 'refs/heads/dev') {
    // Direct dev pushes are still built with the nightly identity, but never published.
    publish = await isMergedPullRequestCommit()
    if (!publish) console.log(`${ref} is not a merged PR into dev; it is built but not published.`)
    run('git', ['merge-base', '--is-ancestor', ref, 'origin/dev'])
    const base = JSON.parse(readFileSync('package.json', 'utf8')).version
    if (!/^0\.\d+\.\d+$/.test(base))
        throw new Error('package.json must contain the next main version')
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    version = `${base}-nightly.${date}.${process.env.GITHUB_RUN_NUMBER}`
    channel = 'nightly'
} else {
    version = process.env.GITHUB_REF_NAME?.replace(/^v/, '')
    if (!/^0\.\d+\.\d+$/.test(version)) throw new Error('Main release tags must match v0.x.y')
    run('git', ['merge-base', '--is-ancestor', ref, 'origin/main'])
    const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
    if (version !== packageVersion) throw new Error('Tag and package.json version must match')
}
appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\nchannel=${channel}\nref=${ref}\npublish=${publish}\n`,
)
