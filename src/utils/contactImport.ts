import type { GraphNode } from '../services/graphService';

/**
 * One person offered for import — parsed from the phone's address book, the browser's Contact
 * Picker, or an uploaded vCard/CSV. Nothing here has left the device yet: only the candidates the
 * user ticks are ever sent to the server.
 */
export interface ImportCandidate {
  key: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  about: string;
}

export interface ImportSourceContact {
  given?: string | null;
  family?: string | null;
  display?: string | null;
  phones?: { number: string | null; type?: string | null; isPrimary?: boolean | null }[];
  company?: string | null;
  jobTitle?: string | null;
}

// --- Matching (mirrors ContactService#phoneKey / #nameKey on the backend) ---

/** Last 10 digits, so "+1 555-123-4567" and "(555) 123-4567" match; null if too short to be real. */
export const phoneKey = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const nameKey = (firstName: string, lastName: string): string =>
  `${firstName.trim()} ${lastName.trim()}`.trim().replace(/\s+/g, ' ').toLowerCase();

export const candidateDisplayName = (c: ImportCandidate): string => `${c.firstName} ${c.lastName}`.trim();

/**
 * Ids of candidates already in the graph, using the same rule the import applies (phone match when
 * the candidate has a phone, otherwise full-name match), so "Already added" matches what gets skipped.
 */
export const findExistingCandidates = (candidates: ImportCandidate[], nodes: GraphNode[]): Set<string> => {
  const phones = new Set<string>();
  const names = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'PLACEHOLDER') continue;
    const pk = phoneKey(n.phoneNumber);
    if (pk) phones.add(pk);
    names.add(nameKey(n.firstName, n.lastName));
  }
  const existing = new Set<string>();
  for (const c of candidates) {
    const pk = phoneKey(c.phoneNumber);
    if (pk ? phones.has(pk) : names.has(nameKey(c.firstName, c.lastName))) existing.add(c.key);
  }
  return existing;
};

// --- Normalizing a raw contact into a candidate ---

const MOBILE_TYPES = new Set(['mobile', 'cell', 'iphone', 'work_mobile', 'mms']);

const pickPhone = (phones: ImportSourceContact['phones']): string | null => {
  const usable = (phones ?? []).filter((p) => p.number && p.number.trim());
  if (usable.length === 0) return null;
  const mobile = usable.find((p) => MOBILE_TYPES.has((p.type ?? '').toLowerCase()));
  const primary = usable.find((p) => p.isPrimary);
  return (mobile ?? primary ?? usable[0]).number!.trim();
};

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const toCandidate = (raw: ImportSourceContact, key: string): ImportCandidate | null => {
  let firstName = clean(raw.given);
  let lastName = clean(raw.family);
  if (!firstName && !lastName) {
    const display = clean(raw.display);
    if (display) {
      const parts = display.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
  }
  if (!firstName && lastName) {
    firstName = lastName;
    lastName = '';
  }
  const company = clean(raw.company);
  const jobTitle = clean(raw.jobTitle);
  if (!firstName) {
    // A business card with no person's name still has a usable label.
    if (!company) return null;
    firstName = company;
  }
  const about = jobTitle && company && company !== firstName ? `${jobTitle} at ${company}` : company !== firstName ? company || jobTitle : jobTitle;
  return { key, firstName, lastName, phoneNumber: pickPhone(raw.phones), about };
};

/**
 * Turns raw contacts into candidates: drops ones with no usable name, merges entries that share a
 * phone number (address books are full of duplicates), and sorts by name.
 */
export const toCandidates = (raws: ImportSourceContact[], keyPrefix: string): ImportCandidate[] => {
  const seenPhones = new Set<string>();
  const seenNamesWithoutPhone = new Set<string>();
  const out: ImportCandidate[] = [];
  raws.forEach((raw, i) => {
    const c = toCandidate(raw, `${keyPrefix}-${i}`);
    if (!c) return;
    const pk = phoneKey(c.phoneNumber);
    if (pk) {
      if (seenPhones.has(pk)) return;
      seenPhones.add(pk);
    } else {
      const nk = nameKey(c.firstName, c.lastName);
      if (seenNamesWithoutPhone.has(nk)) return;
      seenNamesWithoutPhone.add(nk);
    }
    out.push(c);
  });
  return out.sort((a, b) => candidateDisplayName(a).localeCompare(candidateDisplayName(b)));
};

// --- vCard (.vcf) ---

const decodeQuotedPrintable = (value: string): string => {
  const bytes: number[] = [];
  const text = value.replace(/=\r?\n/g, '');
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(text[i]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
};

const unescapeVCard = (value: string): string =>
  value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

/** Splits on unescaped `;` (structured values like N and ORG). */
const splitStructured = (value: string): string[] => value.split(/(?<!\\);/).map(unescapeVCard);

/**
 * Parses vCard 2.1 / 3.0 / 4.0 — what iOS Contacts, Android Contacts, Google Contacts and Outlook
 * all export. Reads only names, phone numbers and organization; everything else is ignored.
 */
export const parseVCard = (text: string): ImportSourceContact[] => {
  // A line starting with whitespace continues the previous one (RFC 6350 folding); so does the
  // line after a quoted-printable value's soft break (a trailing '='), which the QP decoder strips.
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .reduce<string[]>((acc, line) => {
      const prev = acc[acc.length - 1];
      const softBreak =
        prev !== undefined && prev.endsWith('=') && /QUOTED-PRINTABLE/i.test(prev.slice(0, prev.indexOf(':')));
      if (softBreak) acc[acc.length - 1] += '\n' + line;
      else if (/^[ \t]/.test(line) && prev !== undefined) acc[acc.length - 1] += line.slice(1);
      else acc.push(line);
      return acc;
    }, []);

  const contacts: ImportSourceContact[] = [];
  let current: ImportSourceContact | null = null;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [rawName, ...params] = head.split(';');
    const name = rawName.replace(/^.*\./, '').toUpperCase(); // strip "item1." groups
    const paramText = params.join(';').toUpperCase();

    if (name === 'BEGIN' && value.trim().toUpperCase() === 'VCARD') {
      current = { phones: [] };
      continue;
    }
    if (!current) continue;
    if (name === 'END') {
      contacts.push(current);
      current = null;
      continue;
    }
    if (paramText.includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value);

    switch (name) {
      case 'FN':
        current.display = unescapeVCard(value);
        break;
      case 'N': {
        const [family, given] = splitStructured(value);
        current.family = family;
        current.given = given;
        break;
      }
      case 'TEL': {
        const type = /CELL|MOBILE|IPHONE/.test(paramText) ? 'mobile' : null;
        current.phones!.push({ number: value.replace(/^tel:/i, ''), type, isPrimary: /PREF/.test(paramText) });
        break;
      }
      case 'ORG':
        current.company = splitStructured(value)[0];
        break;
      case 'TITLE':
        current.jobTitle = unescapeVCard(value);
        break;
    }
  }
  return contacts;
};

// --- CSV (Google Contacts, Outlook, or any sheet with name/phone columns) ---

export const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
};

const findColumn = (headers: string[], ...names: string[]): number =>
  headers.findIndex((h) => names.includes(h));

export const parseContactsCsv = (text: string): ImportSourceContact[] => {
  const [headerRow, ...rows] = parseCsvRows(text);
  if (!headerRow) return [];
  const headers = headerRow.map((h) => h.trim().toLowerCase());

  const given = findColumn(headers, 'first name', 'given name', 'first', 'firstname');
  const family = findColumn(headers, 'last name', 'family name', 'surname', 'last', 'lastname');
  const display = findColumn(headers, 'name', 'full name', 'display name', 'fullname');
  const company = findColumn(headers, 'organization name', 'organization 1 - name', 'company', 'organization');
  const jobTitle = findColumn(headers, 'organization title', 'organization 1 - title', 'job title', 'title');
  // Every phone-ish column, mobile ones first: "Phone 1 - Value" (Google), "Mobile Phone" (Outlook),
  // or just "phone".
  const phoneCols = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /phone|mobile|cell|tel/.test(h) && !/label|type/.test(h))
    .sort((a, b) => Number(/mobile|cell/.test(b.h)) - Number(/mobile|cell/.test(a.h)));
  // Google labels its numbers in a sibling "Phone N - Label" column.
  const labelFor = (valueHeader: string) => headers.indexOf(valueHeader.replace(/value$/, 'label'));

  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
  return rows.map((row) => ({
    given: cell(row, given),
    family: cell(row, family),
    display: cell(row, display),
    company: cell(row, company),
    jobTitle: cell(row, jobTitle),
    phones: phoneCols
      .map(({ h, i }) => ({
        // Google packs several numbers into one cell as "a ::: b".
        number: cell(row, i).split(':::')[0].trim(),
        type: /mobile|cell/.test(h) || /mobile|cell/i.test(cell(row, labelFor(h))) ? 'mobile' : null,
      }))
      .filter((p) => p.number),
  }));
};

/** Picks a parser from the file's name/contents. */
export const parseContactsFile = (fileName: string, text: string): ImportSourceContact[] => {
  if (/\.vcf$|\.vcard$/i.test(fileName) || /^\s*BEGIN:VCARD/i.test(text)) return parseVCard(text);
  return parseContactsCsv(text);
};
