import type { SearchMode } from '../../services/userService';

export const SEARCH_PLACEHOLDERS: Record<SearchMode, string> = {
  names: 'Search people by name…',
  tags: 'Type a tag or pick a category…',
  bios: 'Search what people wrote about themselves…',
  notes: 'Search your private notes…',
};
