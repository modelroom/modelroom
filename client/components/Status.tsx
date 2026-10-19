// The small, repeated pieces: a badge that speaks the tool's tones, the
// agent/stream status pill, and the panel chrome every column shares.

import type { ReactNode } from 'react';
import { Badge, Box, Group, Loader, Text, type BadgeProps } from '@mantine/core';
import { TONES, type Tone } from '../theme.ts';
import { useI18n } from '../lib/i18n.tsx';

/** A brief's `Status:` picks the tone — adopted/approved is the good one. */
export function toneForStatus(status: string | null | undefined): Tone {
  const value = String(status ?? '').toLowerCase();
  if (/adopt|approv|done|complete|accept/.test(value)) return 'success';
  if (/review/.test(value)) return 'warning';
  return 'muted';
}

export function ToneBadge({
  tone = 'default',
  children,
  ...rest
}: { tone?: Tone; children: ReactNode } & Omit<BadgeProps, 'color' | 'variant'>) {
  return (
    <Badge size="sm" radius="sm" {...TONES[tone]} {...rest}>
      {children}
    </Badge>
  );
}

/**
 * Whether the SSE stream is up and what the server says it is doing. It is the
 * same widget in the dashboard and in a room, so it lives here.
 */
export function AgentStatus({
  connected,
  busy,
  message,
}: {
  connected: boolean;
  busy: boolean;
  message?: string;
}) {
  const { t } = useI18n();
  return (
    <ToneBadge
      tone={connected ? 'outline' : 'destructive'}
      leftSection={
        busy ? (
          <Loader size={10} color="currentColor" />
        ) : (
          <Box
            w={6}
            h={6}
            style={{
              borderRadius: 999,
              backgroundColor: connected ? 'var(--mr-success)' : 'var(--mr-danger)',
            }}
          />
        )
      }
    >
      {connected ? message || t('common.ready') : t('common.reconnecting')}
    </ToneBadge>
  );
}

/** One column of the room: a header line and a body that scrolls itself. */
export function Panel({
  title,
  right,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        flex: 1,
        height: '100%',
        backgroundColor: 'var(--mr-panel)',
      }}
    >
      <Group
        gap="xs"
        wrap="nowrap"
        px="sm"
        py={6}
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
          {title}
        </Text>
        <Group gap="xs" ml="auto" wrap="nowrap">
          {right}
        </Group>
      </Group>
      <Box style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {children}
      </Box>
    </Box>
  );
}

/** A dated line: files and messages both say when they changed. */
export function Meta({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" c="dimmed" ff="monospace">
      {children}
    </Text>
  );
}
