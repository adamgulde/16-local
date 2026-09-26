import { describe, it, expect } from 'vitest';
import { isSafeNavigationPath } from './navigationPath';

describe('isSafeNavigationPath', () => {
  it('accepts app-relative paths', () => {
    expect(isSafeNavigationPath('/x')).toBe(true);
    expect(isSafeNavigationPath('/users/1?a=b')).toBe(true);
  });

  it('rejects empty, protocol-relative, absolute URLs, and non-paths', () => {
    expect(isSafeNavigationPath('')).toBe(false);
    expect(isSafeNavigationPath('//evil.com')).toBe(false);
    expect(isSafeNavigationPath('http://x')).toBe(false);
    expect(isSafeNavigationPath('javascript:alert(1)')).toBe(false);
    expect(isSafeNavigationPath('x')).toBe(false);
    expect(isSafeNavigationPath('/\\evil')).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(isSafeNavigationPath(undefined)).toBe(false);
    expect(isSafeNavigationPath(null)).toBe(false);
    expect(isSafeNavigationPath(42)).toBe(false);
    expect(isSafeNavigationPath({})).toBe(false);
  });
});
