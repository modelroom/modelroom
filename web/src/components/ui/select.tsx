// A native <select>, dressed like the rest. shadcn's Select is Radix-based and
// gives us a listbox we do not need; the dashboard's facet selects are one value
// out of a handful, and the native control is the more accessible one that way.

import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils.ts';

function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(
          'h-8 w-full appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-sm shadow-xs transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
