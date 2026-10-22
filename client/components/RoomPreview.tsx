// The dashboard's preview: a room, from the right, without leaving the list.
//
// It is the same tabbed surface a room shows — the artifact and the docs — minus
// the session, and with one way out that is not a back button: "open room", which
// goes to the detail view where editing and chat live.

import { useEffect, useState } from 'react';
import { Box, Button, Drawer, Group, Loader, Text } from '@mantine/core';
import { getRoom, type RoomResponse } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';
import { RoomTabs } from './RoomTabs.tsx';
import { ToneBadge, toneForStatus } from './Status.tsx';

export function RoomPreview({ room, onClose }: { room: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<RoomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return undefined;
    let alive = true;
    setData(null);
    setError(null);
    void (async () => {
      try {
        const response = await getRoom(room);
        if (!alive) return;
        const maybe = response as unknown as { error?: string };
        if (maybe.error || !response.room) setError(maybe.error ?? t('room.cannotLoad'));
        else setData(response);
      } catch {
        if (alive) setError(t('room.cannotLoad'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [room, t]);

  const info = data?.room;
  const title = info?.title || room || '';

  return (
    <Drawer
      opened={room !== null}
      onClose={onClose}
      position="right"
      size="min(1100px, 92vw)"
      padding={0}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      }}
      title={
        <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
          <Text fw={600} truncate style={{ minWidth: 0 }}>
            {title}
          </Text>
          {info?.status && <ToneBadge tone={toneForStatus(info.status)}>{info.status}</ToneBadge>}
          <Button
            ml="auto"
            mr="md"
            component="a"
            href={room ? `/rooms/${encodeURIComponent(room)}` : '/'}
            size="compact-xs"
            leftSection={<Icon name="arrow-right" size={13} />}
          >
            {t('dashboard.openRoom')}
          </Button>
        </Group>
      }
    >
      {error ? (
        <Box p="md">
          <Text size="sm" c="danger">
            {error}
          </Text>
        </Box>
      ) : !data ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Box style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <RoomTabs
            key={room ?? ''}
            room={room as string}
            roomsPath={data.config.rooms}
            artifact={data.config.artifact}
            docs={data.config.docs}
            info={data.room}
            snapshotDevice={data.room.device}
            devices={data.config.devices}
          />
        </Box>
      )}
    </Drawer>
  );
}
