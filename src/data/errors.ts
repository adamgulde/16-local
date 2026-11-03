/** A problem with what the user asked for: bad input, a limit, or a missing record. */
export class DataError extends Error {
  readonly status: 400 | 404;
  constructor(message: string, status: 400 | 404 = 400) {
    super(message);
    this.name = 'DataError';
    this.status = status;
  }
}

/** Shared "not found" for any record looked up by id. */
export const notFound = (what: string): DataError => new DataError(`${what} not found`, 404);
