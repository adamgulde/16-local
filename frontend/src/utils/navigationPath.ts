/**
 * Validates a notification tap-through path before navigating with it.
 * Accepts only app-relative paths starting with a single "/" (rejects
 * protocol-relative "//", backslash-prefixed, absolute URLs, and non-strings).
 */
export const isSafeNavigationPath = (path: unknown): path is string => {
  if (typeof path !== 'string') return false;
  if (path.length === 0) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.startsWith('/\\')) return false;
  return true;
};
