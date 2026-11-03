import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../services/graphService';
import {
  findExistingCandidates,
  parseContactsCsv,
  parseContactsFile,
  parseCsvRows,
  parseVCard,
  phoneKey,
  toCandidates,
} from './contactImport';

const node = (over: Partial<GraphNode>): GraphNode => ({
  id: 'n',
  kind: 'PLACEHOLDER',
  firstName: '',
  lastName: '',
  about: '',
  phoneNumber: null,
  tags: [],
  note: '',
  strength: 3 as const,
  knownPersonally: true,
  editable: true,
  ...over,
});

describe('parseVCard', () => {
  it('reads names, a preferred mobile number and organization from vCard 3.0', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Lovelace;Ada;;;',
      'FN:Ada Lovelace',
      'item1.TEL;type=HOME:555-000-0001',
      'TEL;TYPE=CELL,VOICE:(555) 000-0002',
      'ORG:Analytical Engines\\, Ltd;Research',
      'TITLE:Programmer',
      'PHOTO;ENCODING=b;TYPE=JPEG:QUJDRA==',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Alan',
      '  Turing',
      'END:VCARD',
    ].join('\r\n');

    const [ada, alan] = toCandidates(parseVCard(vcf), 'f');
    expect(ada).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phoneNumber: '(555) 000-0002',
      about: 'Programmer at Analytical Engines, Ltd',
    });
    expect(alan).toMatchObject({ firstName: 'Alan', lastName: 'Turing', phoneNumber: null });
  });

  it('decodes quoted-printable vCard 2.1 (Android exports) including soft line breaks', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BC=',
      'rgen;;;',
      'TEL;CELL:+15550000003',
      'END:VCARD',
    ].join('\n');
    const [c] = toCandidates(parseVCard(vcf), 'f');
    expect(c).toMatchObject({ firstName: 'Jürgen', lastName: 'Müller', phoneNumber: '+15550000003' });
  });

  it('is picked for .vcf files', () => {
    expect(parseContactsFile('contacts.vcf', 'BEGIN:VCARD\nFN:X\nEND:VCARD')).toHaveLength(1);
  });
});

describe('parseContactsCsv', () => {
  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    expect(parseCsvRows('a,"b, c","say ""hi""\nthere"\r\n1,2,3')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
  });

  it('reads a Google Contacts export, preferring the mobile-labelled number', () => {
    const csv =
      '﻿First Name,Last Name,Organization Name,Phone 1 - Label,Phone 1 - Value,Phone 2 - Label,Phone 2 - Value\n' +
      'Grace,Hopper,US Navy,Work,555-000-0010,Mobile,555-000-0011 ::: 555-000-0012\n';
    const [c] = toCandidates(parseContactsCsv(csv), 'f');
    expect(c).toMatchObject({ firstName: 'Grace', lastName: 'Hopper', phoneNumber: '555-000-0011', about: 'US Navy' });
  });

  it('reads an Outlook export and a bare name/phone sheet', () => {
    const outlook = 'First Name,Last Name,Business Phone,Mobile Phone\nKatherine,Johnson,555-000-0020,555-000-0021\n';
    expect(toCandidates(parseContactsCsv(outlook), 'f')[0].phoneNumber).toBe('555-000-0021');
    const bare = 'Name,Phone\nLinus Torvalds,555 000 0030\n';
    expect(toCandidates(parseContactsCsv(bare), 'f')[0]).toMatchObject({ firstName: 'Linus', lastName: 'Torvalds' });
  });
});

describe('toCandidates', () => {
  it('drops nameless entries, merges shared phone numbers and sorts by name', () => {
    const out = toCandidates(
      [
        { given: 'Zed', phones: [{ number: '+1 555-000-0040' }] },
        { given: 'Zed Dup', phones: [{ number: '5550000040' }] },
        { phones: [{ number: '555-000-0041' }] },
        { company: 'Pizza Place', phones: [{ number: '555-000-0042' }] },
        { family: 'Onlylast' },
      ],
      'k'
    );
    expect(out.map((c) => `${c.firstName}|${c.lastName}`)).toEqual(['Onlylast|', 'Pizza Place|', 'Zed|']);
  });
});

describe('findExistingCandidates', () => {
  it('matches by phone when there is one, otherwise by full name', () => {
    const candidates = toCandidates(
      [
        { given: 'New', family: 'Name', phones: [{ number: '(555) 000-0050' }] },
        { given: 'sam', family: 'SMITH' },
        { given: 'Shared', family: 'Person' },
        { given: 'Fresh', family: 'Face' },
      ],
      'k'
    );
    const existing = findExistingCandidates(candidates, [
      node({ firstName: 'Old', phoneNumber: '+1 555-000-0050' }),
      node({ firstName: 'Sam', lastName: 'Smith' }),
    ]);
    const names = candidates.filter((c) => existing.has(c.key)).map((c) => c.firstName);
    expect(names.sort()).toEqual(['New', 'sam']);
  });

  it('phoneKey ignores formatting and country code', () => {
    expect(phoneKey('+1 (555) 000-0060')).toBe(phoneKey('5550000060'));
    expect(phoneKey('911')).toBeNull();
  });
});
