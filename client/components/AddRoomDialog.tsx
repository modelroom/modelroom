// Add a room, from the dashboard.
//
// Creating is the CLI's `add`: the templates' docs and an empty artifact. The
// dialog only gathers the name — the server writes the room with the same code
// `modelroom add` runs, so the two cannot drift.

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { createRoom } from '../lib/api.ts';
import { roomNameCheck } from '../lib/roomname.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';
import { RoomNameField } from './RoomNameField.tsx';

export function AddRoomDialog({
  opened,
  onClose,
  names,
  prefix,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  /** Every existing room's name. */
  names: readonly string[];
  /** `cfg.rooms` — what the hint and the path are built from. */
  prefix: string;
  onCreated: (room: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh dialog never carries the last attempt.
  useEffect(() => {
    if (opened) {
      setName('');
      setTitle('');
      setError(null);
      setBusy(false);
    }
  }, [opened]);

  const check = roomNameCheck(name, names);
  const canCreate = check.valid && !busy;

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError(null);
    const result = await createRoom(name.trim(), title.trim() || undefined);
    setBusy(false);
    if (result.error || !result.room) {
      setError(result.error ?? t('dashboard.createFailed'));
      return;
    }
    onCreated(result.room);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('dashboard.addRoom')} centered>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {t('dashboard.addRoomHint', { prefix })}
        </Text>
        <RoomNameField
          value={name}
          onChange={setName}
          names={names}
          label={t('dashboard.roomName')}
          placeholder={t('dashboard.roomNamePlaceholder')}
          autoFocus
          onEnter={() => void submit()}
        />
        <TextInput
          label={t('dashboard.roomTitle')}
          placeholder={t('dashboard.roomTitlePlaceholder')}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
        {error && (
          <Alert color="danger" variant="light" icon={<Icon name="alert" size={14} />}>
            {error}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" size="compact-sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="compact-sm"
            onClick={() => void submit()}
            disabled={!canCreate}
            loading={busy}
            leftSection={<Icon name="plus" size={14} />}
          >
            {busy ? t('dashboard.creating') : t('dashboard.create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
