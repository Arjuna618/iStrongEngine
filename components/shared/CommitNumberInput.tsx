import React, { useState } from 'react';
import { NumberBox } from '../kit/NumberBox';

interface CommitNumberInputProps {
  value: number;
  onCommit: (v: number) => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
  arrows?: boolean;
}

export const CommitNumberInput: React.FC<CommitNumberInputProps> = ({ value, onCommit, className, ariaLabel, title, arrows }) => {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = parseFloat(text.replace(/,/g, ''));
    setText(null);
    if (Number.isFinite(v)) onCommit(v);
  };
  return (
    <NumberBox
      inputMode="numeric"
      arrows={arrows}
      value={text !== null ? text : String(value)}
      onFocus={() => setText(String(value))}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      aria-label={ariaLabel}
      title={title}
      className={className}
    />
  );
};
