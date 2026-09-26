import { useImperativeHandle, useMemo, useState, type CSSProperties, type Ref } from 'react';
import type { Tag } from '../../services/tagService';
import { buildTagIndex, disambiguator, searchTags } from '../../utils/tagTree';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../Icons';
import { ChipGrid } from './TagChip';
import { CategoryIcon } from './CategoryIcon';
import { CHIP_METRICS, optionChipStyle, type TagDensity } from './tagTheme';

export interface TagPickerHandle {
  // Enter in the owning input: take the best suggestion, else the text/custom fallback.
  submitQuery: () => void;
}

interface TagPickerProps {
  tags: Tag[];
  // Typed text, owned by the input that hosts the picker.
  query: string;
  // Tags already applied (card) or selected as criteria (search) — shown checked.
  appliedIds: ReadonlySet<string>;
  onPick: (tag: Tag) => void;
  // Search: use the typed text itself as a criterion.
  onText?: (text: string) => void;
  // Card: file the typed text as a custom tag under the node being browsed.
  onCreateCustom?: (label: string, parent: Tag | null) => void;
  onClearQuery?: () => void;
  customNeedsParent?: boolean;
  // Tagging someone else: hide sensitive self-only categories entirely.
  excludeSelfOnly?: boolean;
  density?: TagDensity;
  rows: number;
  disabled?: boolean;
  ref?: Ref<TagPickerHandle>;
}

const mutedText: CSSProperties = { fontSize: '10.5px', color: '#8e8e93' };

const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: '#6ab0ff',
  cursor: 'pointer',
  fontSize: '10.5px',
};

// Category chips (single-select) → breadcrumb → the current node's children, wrapped
// left-to-right and capped at `rows`. Typing switches to ranked suggestions, scoped to the
// node being browsed. A chip with children has a separate "›" target, so choosing "Music"
// and drilling into Music never collide.
export const TagPicker = ({
  tags,
  query,
  appliedIds,
  onPick,
  onText,
  onCreateCustom,
  onClearQuery,
  customNeedsParent = false,
  excludeSelfOnly = false,
  density = 'regular',
  rows,
  disabled = false,
  ref,
}: TagPickerProps) => {
  const index = useMemo(() => buildTagIndex(tags), [tags]);
  const [path, setPath] = useState<string[]>([]);
  const m = CHIP_METRICS[density];

  const include = (tag: Tag) => !(excludeSelfOnly && tag.selfOnly);
  const categories = index.categories.filter(include);
  const currentNode = path.length ? index.byId.get(path[path.length - 1]) ?? null : null;
  const trimmed = query.trim();

  const suggestions = useMemo(
    () => searchTags(index, trimmed, { withinId: currentNode?.id, include: (t) => !(excludeSelfOnly && t.selfOnly) }),
    [index, trimmed, currentNode, excludeSelfOnly]
  );
  const exactMatch = suggestions.some((t) => t.label.toLowerCase() === trimmed.toLowerCase());
  const canCreate = !!onCreateCustom && trimmed.length > 0 && !exactMatch && (!customNeedsParent || !!currentNode);

  useImperativeHandle(ref, () => ({
    submitQuery: () => {
      if (!trimmed || disabled) return;
      if (suggestions[0]) onPick(suggestions[0]);
      else if (canCreate) onCreateCustom!(trimmed, currentNode);
      else onText?.(trimmed);
    },
  }));

  const selectCategory = (id: string) => setPath((prev) => (prev[0] === id && prev.length === 1 ? [] : [id]));

  // Drilling always lands on the node's real place in the tree; from a search result it also
  // clears the query so the node's children show instead of an empty filtered list.
  const lineageIds = (id: string): string[] => {
    const ids: string[] = [];
    let node = index.byId.get(id);
    while (node) {
      ids.unshift(node.id);
      node = node.parentId ? index.byId.get(node.parentId) : undefined;
    }
    return ids;
  };

  const drillInto = (id: string) => {
    setPath(lineageIds(id));
    if (trimmed) onClearQuery?.();
  };

  const optionChip = (tag: Tag, visible: Tag[]) => {
    const applied = appliedIds.has(tag.id);
    const drillOnly = !tag.selectable;
    const hint = disambiguator(tag, visible, index);
    return (
      <span key={tag.id} style={{ ...optionChipStyle(density, applied), padding: 0, gap: 0, cursor: 'default' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => (drillOnly ? drillInto(tag.id) : onPick(tag))}
          title={tag.fullPath}
          aria-pressed={drillOnly ? undefined : applied}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            font: 'inherit',
            height: '100%',
            padding: `0 ${tag.hasChildren ? 3 : m.padX}px 0 ${m.padX}px`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {applied && <CheckIcon size={m.icon} color="#6ab0ff" />}
          <span>{tag.label}</span>
          {hint && <span style={{ color: '#8e8e93' }}>· {hint}</span>}
        </button>
        {tag.hasChildren && (
          <button
            type="button"
            onClick={() => drillInto(tag.id)}
            aria-label={`Show tags under ${tag.label}`}
            title={`Show tags under ${tag.label}`}
            style={{
              background: 'none',
              border: 'none',
              borderLeft: drillOnly ? 'none' : '1px solid #3a3a42',
              color: '#9a9aa2',
              height: '100%',
              padding: `0 ${m.padX - 2}px 0 3px`,
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <ChevronRightIcon size={m.icon} />
          </button>
        )}
      </span>
    );
  };

  const children = currentNode ? index.childrenOf(currentNode.id).filter(include) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      {/* Categories: one active at a time, scrolls sideways rather than wrapping */}
      <div
        role="tablist"
        aria-label="Tag categories"
        style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '1px' }}
      >
        {categories.map((cat) => {
          const active = path[0] === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectCategory(cat.id)}
              style={{ ...optionChipStyle(density, active), flexShrink: 0 }}
            >
              <CategoryIcon icon={cat.icon} size={m.icon} color={active ? '#ffffff' : '#6ab0ff'} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Breadcrumb for the node being browsed / searched within */}
      {currentNode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', ...mutedText }}>
          <button type="button" onClick={() => setPath((p) => p.slice(0, -1))} aria-label="Up one level" style={{ ...linkButton, display: 'inline-flex' }}>
            <ChevronLeftIcon size={12} />
          </button>
          {path.map((id, i) => {
            const node = index.byId.get(id);
            const last = i === path.length - 1;
            return (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {i > 0 && <span>›</span>}
                {last ? (
                  <span style={{ color: '#d4d4d8', fontWeight: 600 }}>{node?.label}</span>
                ) : (
                  <button type="button" style={linkButton} onClick={() => setPath(path.slice(0, i + 1))}>
                    {node?.label}
                  </button>
                )}
              </span>
            );
          })}
          {trimmed && <span>· matching “{trimmed}”</span>}
        </div>
      )}

      {trimmed ? (
        <>
          {suggestions.length > 0 ? (
            <ChipGrid rows={rows} density={density} measureKey={`q:${trimmed}:${currentNode?.id}`}>
              {suggestions.map((t) => optionChip(t, suggestions))}
            </ChipGrid>
          ) : (
            <div style={mutedText}>
              No tags match “{trimmed}”{currentNode ? ` in ${currentNode.label}` : ''}.{' '}
              {currentNode && (
                <button type="button" style={linkButton} onClick={() => setPath([])}>
                  Search all categories
                </button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {onText && (
              <button type="button" disabled={disabled} onClick={() => onText(trimmed)} style={optionChipStyle(density)}>
                <SearchIcon size={m.icon} color="#9a9aa2" />
                Any tag containing “{trimmed}”
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onCreateCustom!(trimmed, currentNode)}
                style={{ ...optionChipStyle(density), borderStyle: 'dashed' }}
              >
                <PlusIcon size={m.icon} color="#2dd4bf" />
                Add “{trimmed}”{currentNode ? ` to ${currentNode.label}` : ''}
              </button>
            )}
            {onCreateCustom && customNeedsParent && !currentNode && !exactMatch && (
              <span style={mutedText}>Pick a category to add “{trimmed}” as a custom tag.</span>
            )}
          </div>
        </>
      ) : currentNode ? (
        children.length > 0 ? (
          <ChipGrid rows={rows} density={density} measureKey={`n:${currentNode.id}`}>
            {children.map((t) => optionChip(t, children))}
          </ChipGrid>
        ) : (
          <div style={mutedText}>Nothing further here{onCreateCustom ? ' — type to add your own.' : '.'}</div>
        )
      ) : (
        <div style={mutedText}>Pick a category, or start typing to find a tag.</div>
      )}
    </div>
  );
};
