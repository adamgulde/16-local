// Session-user shape used only by auth (login/register/session storage) and the small handful of
// views that display "you" (App.tsx routing, NotFound, the graph views' identity pill). The
// private-network overhaul (PLAN.md §3) moved everything else — relationships, connection degree,
// per-subject tags/notes — onto `GraphNode`/`SelfProfile` (see graphService.ts, shareService.ts);
// this type keeps only what the session actually carries.
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  bio: string;
  inviteCode?: string;
  createdAt?: string;
  discoverableInSharedGraphs?: boolean;
}

export const fullName = (user: Pick<User, 'firstName' | 'lastName'>): string =>
  `${user.firstName} ${user.lastName}`.trim();

export const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return 'Recently';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return 'Recently';
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString();
};

// Tags-mode criteria: tree nodes (matching everything beneath them) and free-text labels. Still
// shared by the tag picker and the graph's client-side tag search (graphSearch.ts).
export interface TagCriteria {
  tagIds: string[];
  labels: string[];
  matchAll: boolean;
}
