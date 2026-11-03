import { DataError } from '../data/errors';

/** The message to show for a failed action: our own validation messages pass through, anything else gets the fallback. */
export const getSafeErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof DataError ? err.message : fallback;
