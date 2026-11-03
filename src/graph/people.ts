import type { GraphNode } from '../services/graphService';

export type MissingField = 'phone' | 'about' | 'tags';

export const MISSING_LABELS: Record<MissingField, string> = {
  phone: 'no phone',
  about: 'no about',
  tags: 'no tags',
};

/** What's still blank for a person. Empty list means their details are complete. */
export const missingInfo = (n: GraphNode): MissingField[] => {
  if (n.kind === 'SELF') return [];
  const missing: MissingField[] = [];
  if (!n.phoneNumber) missing.push('phone');
  if (!n.about.trim()) missing.push('about');
  if (n.tags.length === 0) missing.push('tags');
  return missing;
};

/** When you last worked with someone: the local change if there is one, else the stored time. */
export const lastSeenAt = (n: GraphNode, local: Record<string, string>): string | null => local[n.id] ?? n.lastInteractedAt;

/** Most recently worked-with people first. Never includes you or people you haven't touched. */
export const recentPeople = (nodes: GraphNode[], local: Record<string, string>, limit = 8): GraphNode[] =>
  nodes
    .filter((n) => n.kind !== 'SELF' && lastSeenAt(n, local) !== null)
    .sort((a, b) => (lastSeenAt(b, local) ?? '').localeCompare(lastSeenAt(a, local) ?? ''))
    .slice(0, limit);

/** People with blank details, A to Z. */
export const peopleNeedingInfo = (nodes: GraphNode[]): GraphNode[] =>
  nodes
    .filter((n) => missingInfo(n).length > 0)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
