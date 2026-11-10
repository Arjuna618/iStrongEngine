import React from 'react';

interface Props {
  version: string;
  unseen?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 h-[20px] px-2 rounded-md ' +
  'font-mono text-[12px] [font-weight:var(--fw-control)] leading-none tracking-tight ' +
  'bg-[var(--k-tag-bg)] border border-transparent ' +
  'text-[var(--text-secondary)] select-none';

export const VersionChip: React.FC<Props> = ({ version, unseen, icon, onClick, title }) => {
  const label = (
    <>
      {icon && <span className="flex shrink-0 -ml-px -mr-0.5">{icon}</span>}
      <span className="relative top-[1px]">{version}</span>
      {unseen && <span className="h-[5px] w-[5px] rounded-full bg-[var(--accent)] shrink-0" />}
    </>
  );

  if (!onClick) return <span className={BASE}>{label}</span>;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        BASE +
        ' transition-[background-color,color] duration-150 ' +
        'hover:[background-image:linear-gradient(var(--alpha-hover),var(--alpha-hover))] hover:text-[var(--text-primary)] ' +
        'active:[background-image:linear-gradient(var(--alpha-active),var(--alpha-active))] cursor-pointer'
      }
    >
      {label}
    </button>
  );
};
