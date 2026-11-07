# Development and Release Guide

## 1. Branches

Keep `main` releasable. Start each change from the latest `main`:

```bash
git switch main
git pull origin main
git switch -c feature/image-preview
```

Branch naming:

- `feature/<name>` for new features
- `fix/<name>` for bug fixes
- `refactor/<name>` for refactoring
- `docs/<name>` for documentation

## 2. Development

Before pushing changes, run:

```bash
npm run build
python -m compileall -q backend
```

Use short English commit messages:

```text
feat: add image preview
fix: correct Windows backend path
refactor: simplify PDF conversion
docs: update release guide
```

## 3. Pull Requests

Push the branch and open a Pull Request into `main`:

```bash
git push -u origin feature/image-preview
```

Before merging, confirm that:

- The change works as intended and contains no unrelated edits.
- The CI `Validate` check passes.
- User-visible changes are described in the PR.

Use Squash merge and delete the branch afterward. Do not develop features directly on `main`.

## 4. Versions and Releases

Follow semantic versioning:

- `patch` for bug fixes, such as `0.2.2 → 0.2.3`
- `minor` for backward-compatible features, such as `0.2.2 → 0.3.0`
- `major` for incompatible changes, such as `0.2.2 → 1.0.0`

After all target Pull Requests are merged:

```bash
git switch main
git pull origin main
npm version minor
git push origin main --follow-tags
```

The version tag triggers native macOS, Windows, and Linux builds and creates a GitHub Release. Never delete, overwrite, or move a published tag. Publish a new version for later fixes.

## 5. CI

- Pull Requests and pushes to `main` run TypeScript checks, the Electron renderer build, and Python syntax checks.
- Tags matching `v*` build `.dmg`, `.exe`, and `.AppImage` packages and publish a Release after all builds pass.
- Do not merge when CI fails. Fix the issue in a new commit instead of reusing a published tag.
