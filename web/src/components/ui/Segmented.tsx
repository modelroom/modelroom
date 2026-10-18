// A named wrapper over shadcn's ToggleGroup, so a switch in the room reads
// `<Segmented value={mode} onChange={setMode} options={MODES} />`.

import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group.tsx';

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<Segment<T>>;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      className={className}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          aria-label={option.title}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
