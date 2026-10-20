// Rename a room, from the room's own header.
//
// The dialog gathers the new name; the server moves the directory and every
// reference with `core/roomops.ts` — the same code `modelroom rename` runs. On
// success the caller navigates to the room's new address.

import { useEffect, useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { renameRoom } from '../lib/api.ts';
import { roomNameCheck } from '../lib/roomname.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';
import { RoomNameField } from './RoomNameField.tsx';

export function RenameRoomDialog({
  opened,
  onClose,
  current,
  names,
  prefix,
  onRenamed,
}: {
  opened: boolean;
  onClose: () => void;
  /** The room's current directory name. */
  current: string;
  /** Every existing room's name. */
  names: readonly string[];
  prefix: string;
  onRenamed: (to: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setName(current);
      setError(null);
      setBusy(false);
    }
  }, [opened, current]);

  const check = roomNameCheck(name, names, current);
  const canRename = check.valid && !busy;

  const submit = async () => {
    if (!canRename) return;
    setBusy(true);
    setError(null);
    const result = await renameRoom(current, name.trim());
    setBusy(false);
    if (result.error || !result.to) {
      setError(result.error ?? t('room.renameFailed'));
      return;
    }
    onRenamed(result.to);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('room.rename')} centered>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {t('room.renameHint')}
        </Text>
        <Text size="xs" ff="monospace" c="dimmed">
          {prefix}/{current}/
        </Text>
        <RoomNameField
          value={name}
          onChange={setName}
          names={names}
          current={current}
          label={t('room.renameName')}
          autoFocus
          onEnter={() => void submit()}
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
            disabled={!canRename}
            loading={busy}
            leftSection={<Icon name="pencil" size={14} />}
          >
            {busy ? t('room.renaming') : t('room.renameAction')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
