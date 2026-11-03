/** Lowercase UUID v4. Lowercase matters: link ordering compares ids as text (see contact_links). */
export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
