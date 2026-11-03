// Port of GraphService.buildFor for the local, single-user graph: you at the centre, your contacts
// around you, and person-to-person links between them.
import type { Db } from './db';
import { getTagsByContact } from './tags';
import type { ContactRow } from './contacts';
import { STRENGTH_MAX, type Graph, type GraphEdge, type GraphNode } from './types';

export const SELF_ID = 'self';

export const buildGraph = async (d: Db): Promise<Graph> => {
  const [self] = await d.all<{ first_name: string; last_name: string; about: string }>(
    'SELECT first_name, last_name, about FROM self_profile WHERE id = 1'
  );
  const contacts = await d.all<ContactRow>('SELECT * FROM contacts ORDER BY first_name, last_name');
  const links = await d.all<{ contact_a_id: string; contact_b_id: string }>(
    'SELECT contact_a_id, contact_b_id FROM contact_links'
  );
  const tagsByContact = await getTagsByContact(d);

  const nodes: GraphNode[] = [
    {
      id: SELF_ID,
      kind: 'SELF',
      firstName: self?.first_name ?? '',
      lastName: self?.last_name ?? '',
      about: self?.about ?? '',
      phoneNumber: null,
      tags: [],
      note: '',
      strength: STRENGTH_MAX,
      knownPersonally: true,
      lastInteractedAt: null,
      editable: true,
    },
    ...contacts.map<GraphNode>((c) => ({
      id: c.id,
      kind: 'PLACEHOLDER',
      firstName: c.first_name,
      lastName: c.last_name,
      about: c.about,
      phoneNumber: c.phone_number,
      tags: tagsByContact.get(c.id) ?? [],
      note: c.note,
      strength: c.strength,
      knownPersonally: c.known_personally === 1,
      lastInteractedAt: c.last_interacted_at,
      editable: true,
    })),
  ];

  // Only people you know get a direct edge from you.
  const edges: GraphEdge[] = contacts
    .filter((c) => c.known_personally === 1)
    .map((c) => ({ source: SELF_ID, target: c.id, kind: 'DIRECT' }));
  for (const l of links) {
    edges.push({ source: l.contact_a_id, target: l.contact_b_id, kind: 'LINK' });
  }
  return { nodes, edges };
};

/** Your own name and about text. */
export interface SelfProfile {
  firstName: string;
  lastName: string;
  about: string;
}

export const getSelfProfile = async (d: Db): Promise<SelfProfile> => {
  const [row] = await d.all<{ first_name: string; last_name: string; about: string }>(
    'SELECT first_name, last_name, about FROM self_profile WHERE id = 1'
  );
  return { firstName: row?.first_name ?? '', lastName: row?.last_name ?? '', about: row?.about ?? '' };
};

export const updateSelfProfile = async (
  d: Db,
  patch: Partial<SelfProfile>
): Promise<void> => {
  const current = await getSelfProfile(d);
  const next: SelfProfile = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  await d.run('UPDATE self_profile SET first_name = ?, last_name = ?, about = ? WHERE id = 1', [
    next.firstName.trim(),
    next.lastName.trim(),
    next.about,
  ]);
};
