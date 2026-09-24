import { useState, type KeyboardEvent } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Shown after the number, e.g. `px`. */
  unit?: string;
  onChange: (value: number) => void;
}

/**
 * Compact numeric input. Commits on Enter/blur (so typing "1" on the way to "1080" doesn't
 * change the image); ↑/↓ step by 1, Shift by 10.
 */
export function NumberField({ label, value, min, max, unit, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    setDraft(null);
    const parsed = Math.round(Number(text));
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(max, Math.max(min, parsed));
    if (next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commit(event.currentTarget.value);
      return;
    }
    if (event.key === 'Escape') {
      setDraft(null);
      return;
    }
    const dir = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    commit(String(value + dir * (event.shiftKey ? 10 : 1)));
  };

  return (
    <label className="iu-field">
      <span className="iu-field__label">{label}</span>
      <input
        className="iu-field__input"
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {unit && <span className="iu-field__unit">{unit}</span>}
    </label>
  );
}
