// The panels are `react-resizable-panels`: the handles are keyboard-reachable
// and the layout is persisted per group. Mantine has no split-pane component,
// so this stays a thin wrapper over the one library that does it — the styling
// is ours, the behaviour is not.
//
// The 4.x line renamed the components (`PanelGroup` → `Group`, `PanelResizeHandle`
// → `Separator`) and turned persistence into the `useDefaultLayout` hook; the
// `autoSaveId` prop is ours, so the call sites keep one prop for the same idea.

import type { ComponentProps } from 'react';
import * as Resizable from 'react-resizable-panels';

/** A group with no id is not remembered; this storage keeps the hook honest. */
const transient: Resizable.LayoutStorage = { getItem: () => null, setItem: () => {} };

export function Split({
  autoSaveId,
  ...props
}: ComponentProps<typeof Resizable.Group> & { autoSaveId?: string }) {
  const { defaultLayout, onLayoutChanged } = Resizable.useDefaultLayout({
    id: autoSaveId ?? 'modelroom.split',
    storage: autoSaveId ? localStorage : transient,
  });
  return (
    <Resizable.Group defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} {...props} />
  );
}

export function SplitPanel({ ...props }: ComponentProps<typeof Resizable.Panel>) {
  return <Resizable.Panel {...props} />;
}

export function SplitHandle({
  withHandle,
  ...props
}: ComponentProps<typeof Resizable.Separator> & { withHandle?: boolean }) {
  return (
    <Resizable.Separator className="mr-split-handle" {...props}>
      {withHandle ? <span className="mr-split-grip" /> : null}
    </Resizable.Separator>
  );
}
