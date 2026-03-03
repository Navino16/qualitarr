import { describe, it, expect } from 'vitest';
import { getVersion } from '../../src/utils/version.js';

describe('getVersion', () => {
  it('should return a valid semver version string', () => {
    const version = getVersion();

    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should return the version from package.json', () => {
    const version = getVersion();

    expect(version).toBe('0.1.0');
  });

  it('should return a consistent value on multiple calls', () => {
    const v1 = getVersion();
    const v2 = getVersion();

    expect(v1).toBe(v2);
  });
});
