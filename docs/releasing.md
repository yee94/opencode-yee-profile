# Release procedure

`.github/workflows/ci.yml` validates push/PR changes. `.github/workflows/release.yml` publishes only pushed `v<version>` tags matching `package.json.version`. Both use Node.js 24 and the committed pnpm lockfile.

## Publish

1. Pull `main`, inspect working changes, and check public npm versions. Choose an unused SemVer version without build metadata.
2. Update `package.json.version` and pinned installation examples in `README.md`. Preserve native Build behavior and V1/V2 compatibility.
3. Run `pnpm check`: lint, build, type-check, isolated model-fixture tests and built-plugin smoke must pass.
4. Commit and push `main`. Create an annotated `v<version>` tag on that pushed commit and push the tag. Push one release tag at a time.
5. Follow the Release run with `gh run watch <run-id> --exit-status`. It packs once, publishes that exact tarball with pnpm, verifies public npm SHA-512 integrity and the expected dist-tag, and creates a GitHub Release. Stable versions use `latest`; prereleases use `next` and GitHub prerelease status.
6. Verify the exact npm version, packaged icon, dist-tag and GitHub Release. A successful publish command alone is not completion.

Authentication uses the repository Actions Secret `NPM_TOKEN`, exposed as `NODE_AUTH_TOKEN` only during publication. Set it through `gh secret set NPM_TOKEN --repo yee94/opencode-yee-profile` using protected stdin, never tracked files or command arguments. It must allow unattended publication of `@yee94/opencode-profile` under the account's current 2FA policy.

## Recovery

- npm can accept an upload before making it public. Verification waits up to ten minutes for the version and dist-tag; do not duplicate publication during that window.
- If verification or GitHub Release creation fails after npm publication, rerun the failed workflow. Exact published integrity skips upload; different content is a hard failure. Reruns do not move npm dist-tags for an already published artifact.
- On authentication failure, update the repository Secret and rerun. Keep all credentials out of source and logs.
- Keep published versions and tags immutable. Code changes require a new version/tag rather than moving an existing public tag.
