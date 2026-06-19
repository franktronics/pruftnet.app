# Release Process

This project uses two long-lived branches and SemVer tags to separate preview and production desktop releases.

## Branches

- `develop`: preview development branch.
- `main`: production branch.

Feature work should land in `develop`. Production releases are created by merging `develop` into `main` and tagging the production commit.

## CI

The `CI` workflow runs on pushes and pull requests targeting `develop` or `main`.

It runs:

- dependency install
- lint
- typecheck
- desktop build

The workflow uses the GitHub `preview` environment because CI artifacts are non-production validation builds.

## Preview Releases

Preview releases are built from tags on `develop`.

Tag format:

```text
vX.Y.Z-preview.N
```

Example:

```bash
git checkout develop
git pull
git tag v0.1.3-preview.1
git push origin v0.1.3-preview.1
```

This creates a GitHub prerelease and uploads desktop installers for macOS, Windows, and Linux.

## Production Releases

Production releases are built from tags on `main`.

Tag format:

```text
vX.Y.Z
```

Example:

```bash
git checkout main
git pull
git merge develop
git push origin main
git tag v0.1.3
git push origin v0.1.3
```

This creates a normal GitHub Release and uploads desktop installers for macOS, Windows, and Linux.

## GitHub Environments

Create these environments in `Settings > Environments`:

- `preview`: used by CI and preview releases.
- `production`: used by production releases.

Recommended production protection:

- required reviewers
- restricted deployment branches/tags if needed
- signing secrets later, when macOS notarization and Windows code signing are enabled
