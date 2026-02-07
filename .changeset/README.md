# Changesets

This folder contains changesets for version management and changelog generation.

## Adding a changeset

When you make a change that should be released, run:

```bash
pnpm changeset
```

This will prompt you to:
1. Select the packages to include
2. Choose a semver bump type (major, minor, patch)
3. Write a summary of the changes

## Versioning strategy

- **Major**: Breaking changes to the public API
- **Minor**: New features, non-breaking
- **Patch**: Bug fixes, documentation, internal changes

## Release process

1. Changes are merged to `main` with changesets
2. GitHub Actions creates a release PR
3. Merging the release PR publishes to npm
