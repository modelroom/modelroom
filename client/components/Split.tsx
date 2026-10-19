// The panels are `react-resizable-panels`: the handles are keyboard-reachable
// and the layout is persisted by the group's `autoSaveId`. Mantine has no
// split-pane component, so this stays a thin wrapper over the one library that
// does it — the styling is ours, the behaviour is not.

import type { ComponentProps } from 'react';
import * as Resizable from 'react-resizable-panels';

export function Split({ ...props }: ComponentProps<typeof Resizable.PanelGroup>) {
  return <Resizable.PanelGroup {...props} />;
}

export function SplitPanel({ ...props }: ComponentProps<typeof Resizable.Panel>) {
  return <Resizable.Panel {...props} />;
}

export function SplitHandle({
  withHandle,
  ...props
}: ComponentProps<typeof Resizable.PanelResizeHandle> & { withHandle?: boolean }) {
  return (
    <Resizable.PanelResizeHandle className="mr-split-handle" {...props}>
      {withHandle ? <span className="mr-split-grip" /> : null}
    </Resizable.PanelResizeHandle>
  );
}
