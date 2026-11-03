import { useEffect, useState, type CSSProperties } from 'react';
import { STRENGTH_MAX, STRENGTH_MIN } from '../data/types';
import { closenessLabel, formatCloseness, parseCloseness } from '../graph/closeness';

interface ClosenessControlProps {
  value: number;
  /** Called once the user lets go of the slider or leaves the text box, not on every drag step. */
  onCommit: (value: number) => void;
  disabled?: boolean;
}

const inputStyle: CSSProperties = {
  width: 72,
  minHeight: 40,
  padding: '6px 8px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  textAlign: 'right',
  boxSizing: 'border-box',
};

/** Slider from 1 to 10 plus a text box that accepts any decimal in that range. */
export const ClosenessControl = ({ value, onCommit, disabled = false }: ClosenessControlProps) => {
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(formatCloseness(value));

  // Follow the saved value when it changes from outside (another edit, or a different person).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(value);
    setText(formatCloseness(value));
  }, [value]);

  const commit = (next: number) => {
    if (next !== value) onCommit(next);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range"
          min={STRENGTH_MIN}
          max={STRENGTH_MAX}
          step={0.1}
          value={draft}
          disabled={disabled}
          aria-label="Closeness"
          onChange={(e) => {
            const next = Number(e.target.value);
            setDraft(next);
            setText(formatCloseness(next));
          }}
          onPointerUp={() => commit(draft)}
          onKeyUp={() => commit(draft)}
          style={{ flex: 1, minHeight: 40, accentColor: '#3d8bff' }}
        />
        <input
          type="text"
          inputMode="decimal"
          aria-label="Closeness value"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const parsed = parseCloseness(text);
            if (parsed === null) {
              setText(formatCloseness(draft));
              return;
            }
            setDraft(parsed);
            setText(formatCloseness(parsed));
            commit(parsed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={inputStyle}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: '#8e8e93' }}>
        <span>{STRENGTH_MIN}</span>
        <span style={{ color: '#6ab0ff' }}>{closenessLabel(draft)}</span>
        <span>{STRENGTH_MAX}</span>
      </div>
    </div>
  );
};
