import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const bump = process.argv[2]
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error('Usage: node scripts/prepare-release.mjs <patch|minor|major>')
  process.exit(1)
}

function run(command, args, capture = false) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
  })?.trim()
}

const branch = run('git', ['branch', '--show-current'], true)
if (branch !== 'main') {
  console.error('Release preparation must start on main.')
  process.exit(1)
}
if (run('git', ['status', '--porcelain'], true)) {
  console.error('Working tree must be clean before preparing a release.')
  process.exit(1)
}

run('git', ['fetch', 'origin', 'main', '--tags'])
run('git', ['merge', '--ff-only', 'origin/main'])

const current = JSON.parse(readFileSync('package.json', 'utf8')).version
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
if (!match) {
  console.error(`Unsupported current version: ${current}`)
  process.exit(1)
}
const parts = match.slice(1).map(Number)
if (bump === 'major') parts.splice(0, 3, parts[0] + 1, 0, 0)
if (bump === 'minor') parts.splice(0, 3, parts[0], parts[1] + 1, 0)
if (bump === 'patch') parts[2] += 1
const version = parts.join('.')
const releaseBranch = `release/v${version}`

if (run('git', ['tag', '--list', `v${version}`], true)) {
  console.error(`Tag v${version} already exists.`)
  process.exit(1)
}

run('git', ['switch', '-c', releaseBranch])
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
run(npm, ['version', version, '--no-git-tag-version'])
run('git', ['add', 'package.json', 'package-lock.json'])
run('git', ['commit', '-m', `chore: bump version to ${version}`])
run('git', ['push', '-u', 'origin', releaseBranch])

const remote = run('git', ['remote', 'get-url', 'origin'], true)
const repository = remote
  .replace(/^git@github\.com:/, '')
  .replace(/^https:\/\/github\.com\//, '')
  .replace(/\.git$/, '')
console.log(`\nCreate and merge the release PR:\nhttps://github.com/${repository}/compare/main...${releaseBranch}?expand=1`)
