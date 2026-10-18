// shadcn/ui — Resizable, on react-resizable-panels.
//
// The room's four columns and the docs' edit/preview split are panels: the
// handles are keyboard-reachable and the layout is persisted by the group's
// `autoSaveId`, so nothing about it is hand-rolled.

import type { ComponentProps } from 'react';
import * as ResizablePrimitive from 'react-resizable-panels';
import { cn } from '../../lib/utils.ts';

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & { withHandle?: boolean }) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        'group relative flex w-px items-center justify-center bg-border transition-colors hover:bg-primary/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden',
        'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
        'after:absolute after:top-0 after:bottom-0 after:-left-1 after:-right-1 after:content-[""]',
        'data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:right-0 data-[panel-group-direction=vertical]:after:-top-1 data-[panel-group-direction=vertical]:after:-bottom-1',
        className,
      )}
      {...props}
    >
      {withHandle ? (
        <div className="z-10 flex h-3 w-1 shrink-0 rounded-full bg-border transition-colors group-hover:bg-primary data-[panel-group-direction=vertical]:h-1 data-[panel-group-direction=vertical]:w-3" />
      ) : null}
    </ResizablePrimitive.PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
