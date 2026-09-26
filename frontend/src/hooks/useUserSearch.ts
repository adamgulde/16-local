import { useEffect, useState } from 'react';
import { searchUsersApi, type SearchMode, type TagCriteria, type User } from '../services/userService';

const NO_RESULTS: User[] = [];

export const EMPTY_TAG_CRITERIA: TagCriteria = { tagIds: [], labels: [], matchAll: true };

export const hasTagCriteria = (criteria: TagCriteria) => criteria.tagIds.length + criteria.labels.length > 0;

// Debounced server search for the active mode. Text modes need text; Tags mode needs at least
// one criterion. `active` is true once there is something to search for.
export const useUserSearch = (mode: SearchMode, text: string, criteria: TagCriteria) => {
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const term = text.trim();
  const active = mode === 'tags' ? hasTagCriteria(criteria) : term.length > 0;
  const criteriaKey = `${criteria.tagIds.join(',')}|${criteria.labels.join('\u0000')}|${criteria.matchAll}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      searchUsersApi(mode, term, mode === 'tags' ? criteria : undefined)
        .then((users) => {
          if (cancelled) return;
          setResults(users);
          setError(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // criteriaKey stands in for the criteria object, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, term, criteriaKey, active]);

  // Nothing to search for: report empty without touching state, so stale results never flash.
  return active ? { results, loading, error, active } : { results: NO_RESULTS, loading: false, error: false, active };
};
