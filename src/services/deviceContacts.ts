import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';
import type { ImportSourceContact } from '../utils/contactImport';

/**
 * Where contacts can be read from on this device. Everything read here stays on the device —
 * the import UI sends only the people the user ticks.
 *  - `device`: the native app's address book (Capacitor plugin, asks for the contacts permission).
 *  - `picker`: the browser Contact Picker API (Chrome on Android) — the OS shows its own chooser.
 * A .vcf/.csv file upload works everywhere and needs nothing here.
 */
export const contactSources = () => ({
  device: Capacitor.isNativePlatform(),
  picker: !Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && 'contacts' in navigator,
});

export class ContactsPermissionDeniedError extends Error {
  constructor() {
    super('Contacts permission denied');
  }
}

export const readDeviceContacts = async (): Promise<ImportSourceContact[]> => {
  let status = await Contacts.checkPermissions();
  if (status.contacts !== 'granted' && status.contacts !== 'limited') {
    status = await Contacts.requestPermissions();
  }
  if (status.contacts !== 'granted' && status.contacts !== 'limited') {
    throw new ContactsPermissionDeniedError();
  }
  const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true, organization: true } });
  return contacts.map((c) => ({
    given: c.name?.given,
    family: c.name?.family,
    display: c.name?.display,
    phones: c.phones?.map((p) => ({ number: p.number, type: p.type, isPrimary: p.isPrimary })),
    company: c.organization?.company,
    jobTitle: c.organization?.jobTitle,
  }));
};

interface PickedContact {
  name?: string[];
  tel?: string[];
}

export const pickBrowserContacts = async (): Promise<ImportSourceContact[]> => {
  const picker = (navigator as unknown as {
    contacts: { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]> };
  }).contacts;
  const picked = await picker.select(['name', 'tel'], { multiple: true });
  return picked.map((p) => ({
    display: p.name?.[0] ?? null,
    phones: (p.tel ?? []).map((number) => ({ number })),
  }));
};
