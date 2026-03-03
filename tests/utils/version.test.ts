import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/utils/version.js';

describe('getVersion', () => {
  it('should return a valid semver version string', () => {
    const version = getVersion();

    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should match the version from package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string };

    expect(getVersion()).toBe(pkg.version);
  });

  it('should return a consistent value on multiple calls', () => {
    const v1 = getVersion();
    const v2 = getVersion();

    expect(v1).toBe(v2);
  });
});
