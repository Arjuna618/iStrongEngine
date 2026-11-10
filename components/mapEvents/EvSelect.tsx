import React from 'react';
import { CustomSelect, type SelectGroup } from '../shared/CustomSelect';

export const EvSelect: React.FC<{ value?: string; onChange: (v: string) => void; options?: { value: string; label: string }[]; groups?: SelectGroup[]; placeholder?: string; className?: string; disabled?: boolean; add?: string }> = ({ className, add, value = '', ...p }) => (
  <CustomSelect {...p} value={value} addLabel={add} className={className ? `w-full ${className}` : 'w-full'} />
);
