import type { CSSProperties } from 'react';
import type { GraphNode } from '../services/graphService';
import { contactFullName } from '../graph/mapping';
import { MISSING_LABELS, missingInfo } from '../graph/people';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';

interface QuickPeopleListProps {
  recent: GraphNode[];
  needsInfo: GraphNode[];
  onPick: (id: string) => void;
  /** Larger rows and touch targets for the mobile sheet. */
  large?: boolean;
}

const heading: CSSProperties = {
  padding: '8px 4px 4px',
  fontSize: 11,
  fontWeight: 600,
  color: '#8e8e93',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

/**
 * Shown in the search box when it's empty: people you worked with most recently, and people whose
 * details are still blank. Tap a row to open that person.
 */
export const QuickPeopleList = ({ recent, needsInfo, onPick, large = false }: QuickPeopleListProps) => {
  const rowStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: large ? 48 : 36,
    padding: large ? '10px 6px' : '6px 8px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    color: '#f0f0f0',
    fontSize: large ? 15 : 13,
    cursor: 'pointer',
    textAlign: 'left',
  };

  if (recent.length === 0 && needsInfo.length === 0) {
    return <div style={{ color: '#8e8e93', fontSize: 13, padding: '12px 4px' }}>Open someone’s card and they’ll show up here.</div>;
  }

  return (
    <div>
      {recent.length > 0 && (
        <>
          <div style={heading}>Recent</div>
          {recent.map((n) => (
            <button key={n.id} type="button" onClick={() => onPick(n.id)} style={rowStyle}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactFullName(n)}</span>
              {n.phoneNumber && <span style={{ color: '#9a9a9a', fontSize: 11, flexShrink: 0 }}>{formatPhoneNumberDisplay(n.phoneNumber)}</span>}
            </button>
          ))}
        </>
      )}
      {needsInfo.length > 0 && (
        <>
          <div style={heading}>Needs info ({needsInfo.length})</div>
          {needsInfo.map((n) => (
            <button key={n.id} type="button" onClick={() => onPick(n.id)} style={rowStyle}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactFullName(n)}</span>
              <span style={{ color: '#e0a94c', fontSize: 11, flexShrink: 0 }}>
                {missingInfo(n).map((f) => MISSING_LABELS[f]).join(', ')}
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
};
