import { appendFileSync, readFileSync } from 'node:fs'
import { run } from './common.mjs'
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
const ref = run('git', ['rev-parse', 'HEAD'], { stdio: 'pipe' })
let channel = 'main'
let version
if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    if (!event.pull_request?.merged || event.pull_request.base.ref !== 'dev')
        throw new Error('Only merged PRs into dev publish nightlies')
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
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nchannel=${channel}\nref=${ref}\n`)
