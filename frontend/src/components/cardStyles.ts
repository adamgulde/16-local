import type { CSSProperties } from 'react';

// Shared by every section of the person-detail card (ContactCard, AddPersonForm, TagsAndNotes) so
// "Bio", "Tags", "Notes", and "Connections" all read as the same weight of heading instead of
// each section inventing its own — the card has exactly one visual heading level below the
// person's name.
export const sectionHeaderStyle: CSSProperties = {
  margin: '0 0 6px',
  fontWeight: 'bold',
  fontSize: '14px',
  textAlign: 'left',
};

export const dividerStyle: CSSProperties = { border: 'none', borderTop: '1px solid #3a3a40', margin: '14px 0' };
