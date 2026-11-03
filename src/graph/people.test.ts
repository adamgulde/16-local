import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../services/graphService';
import { missingInfo, peopleNeedingInfo, recentPeople } from './people';

const person = (over: Partial<GraphNode>): GraphNode => ({
  id: 'p',
  kind: 'PLACEHOLDER',
  firstName: 'Pat',
  lastName: '',
  about: 'Knows jazz',
  phoneNumber: '+1 555-000-0001',
  tags: [{ id: 't', label: 'Jazz' }],
  note: '',
  strength: 5.5,
  knownPersonally: true,
  lastInteractedAt: null,
  editable: true,
  ...over,
});

describe('missingInfo', () => {
  it('lists blank phone, about and tags, and nothing when complete', () => {
    expect(missingInfo(person({}))).toEqual([]);
    expect(missingInfo(person({ phoneNumber: null, about: '  ', tags: [] }))).toEqual(['phone', 'about', 'tags']);
  });

  it('never flags you', () => {
    expect(missingInfo(person({ id: 'self', kind: 'SELF', phoneNumber: null, about: '', tags: [] }))).toEqual([]);
  });
});

describe('recentPeople', () => {
  it('orders by the latest interaction, local changes included, and skips people never touched', () => {
    const nodes = [
      person({ id: 'a', lastInteractedAt: '2026-01-01T00:00:00Z' }),
      person({ id: 'b', lastInteractedAt: '2026-03-01T00:00:00Z' }),
      person({ id: 'c', lastInteractedAt: null }),
    ];
    expect(recentPeople(nodes, {}).map((n) => n.id)).toEqual(['b', 'a']);
    // A selection this session beats an older stored time.
    expect(recentPeople(nodes, { a: '2026-06-01T00:00:00Z' }).map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('caps the list', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => person({ id: `p${i}`, lastInteractedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
    expect(recentPeople(nodes, {})).toHaveLength(8);
  });
});

describe('peopleNeedingInfo', () => {
  it('returns people with blank details, A to Z', () => {
    const nodes = [
      person({ id: 'z', firstName: 'Zed', tags: [] }),
      person({ id: 'a', firstName: 'Abe', phoneNumber: null }),
      person({ id: 'ok', firstName: 'Full' }),
    ];
    expect(peopleNeedingInfo(nodes).map((n) => n.id)).toEqual(['a', 'z']);
  });
});
