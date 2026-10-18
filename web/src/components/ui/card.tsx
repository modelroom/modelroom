// shadcn/ui — Card (the surfaces, without the daisyUI equivalent).

import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils.ts';

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-header" className={cn('flex flex-col gap-1 p-5', className)} {...props} />
  );
}

function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2 data-slot="card-title" className={cn('text-base font-semibold', className)} {...props} />
  );
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
