import { describe, expect, it } from 'vitest';
import {
  assertPublishedArtifact,
  releaseMetadata,
  tarballIntegrity,
} from '../scripts/release-metadata.mjs';

const pkg = { name: '@yee94/opencode-profile', version: '0.3.1' };
const expected = {
  ...pkg,
  integrity: tarballIntegrity(Buffer.from('artifact')),
};
const published = { ...pkg, dist: { integrity: expected.integrity } };

describe('release verification', () => {
  it('requires the exact version tag', () => {
    expect(releaseMetadata(pkg, 'v0.3.1').distTag).toBe('latest');
    expect(() => releaseMetadata(pkg, 'v0.3.2')).toThrow('tag');
  });

  it('keeps prereleases out of latest', () => {
    expect(
      releaseMetadata({ ...pkg, version: '0.3.2-beta.1' }, 'v0.3.2-beta.1')
        .distTag,
    ).toBe('next');
  });

  it('rejects private packages and build metadata', () => {
    expect(() =>
      releaseMetadata({ ...pkg, private: true }, 'v0.3.1'),
    ).toThrow();
    expect(() =>
      releaseMetadata({ ...pkg, version: '0.3.1+build' }, 'v0.3.1+build'),
    ).toThrow();
  });

  it('accepts exact content without npm gitHead', () => {
    expect(() => assertPublishedArtifact(published, expected)).not.toThrow();
  });

  it('rejects missing or changed integrity', () => {
    expect(() =>
      assertPublishedArtifact({ ...published, dist: {} }, expected),
    ).toThrow('integrity');
    expect(() =>
      assertPublishedArtifact(
        {
          ...published,
          dist: { integrity: tarballIntegrity(Buffer.from('other')) },
        },
        expected,
      ),
    ).toThrow('integrity');
  });

  it('rejects a different package or version', () => {
    expect(() =>
      assertPublishedArtifact({ ...published, name: 'other' }, expected),
    ).toThrow('Expected');
    expect(() =>
      assertPublishedArtifact({ ...published, version: '0.3.0' }, expected),
    ).toThrow('Expected');
  });
});
