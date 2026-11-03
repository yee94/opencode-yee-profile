import { createHash } from 'node:crypto';

export const tarballIntegrity = (bytes) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

export const releaseMetadata = (pkg, tag) => {
  const semver =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
  if (pkg.private || !semver.test(pkg.version) || tag !== `v${pkg.version}`) {
    throw new Error('Release tag must match the public package SemVer version');
  }
  return {
    version: pkg.version,
    distTag: pkg.version.includes('-') ? 'next' : 'latest',
  };
};

export const assertPublishedArtifact = (published, expected) => {
  if (
    published.name !== expected.name ||
    published.version !== expected.version
  ) {
    throw new Error(`Expected ${expected.name}@${expected.version}`);
  }
  if (!expected.integrity || published.dist?.integrity !== expected.integrity) {
    throw new Error(
      'Published tarball integrity differs from the tagged artifact',
    );
  }
};
