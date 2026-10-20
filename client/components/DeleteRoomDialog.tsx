// Delete a room, from the room's own menu.
//
// Deleting is a human decision, so the dialog is deliberately deliberate: it
// shows what the room is, warns about the rooms that still point at it, and only
// enables the button once the name is typed back — the way a repository delete
// works on GitHub. When another room references this one, the deletion is
// refused until "delete anyway" is checked, exactly as the CLI refuses without
// `--force`.

import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { getRoomRefs, removeRoom, type RoomInfo } from '../lib/api.ts';
import { stamp } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="xs" c="dimmed" w={88} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="xs">{children}</Text>
    </Group>
  );
}

export function DeleteRoomDialog({
  opened,
  onClose,
  room,
  prefix,
  onDeleted,
}: {
  opened: boolean;
  onClose: () => void;
  /** The room as the server describes it: what the dialog shows. */
  room: RoomInfo;
  prefix: string;
  onDeleted: (room: string) => void;
}) {
  const { t, lang } = useI18n();
  const [referencing, setReferencing] = useState<string[]>([]);
  const [force, setForce] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setForce(false);
    setTyped('');
    setError(null);
    setBusy(false);
    setReferencing([]);
    void (async () => {
      const result = await getRoomRefs(room.name).catch(() => null);
      if (result?.referencing) setReferencing(result.referencing);
    })();
  }, [opened, room.name]);

  const referenced = referencing.length > 0;
  const confirmed = typed.trim() === room.name;
  const canDelete = confirmed && (!referenced || force) && !busy;

  const submit = async () => {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    const result = await removeRoom(room.name, force);
    setBusy(false);
    if (result.error || !result.room) {
      setError(result.error ?? t('room.removeFailed'));
      return;
    }
    onDeleted(result.room);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('room.remove')} centered>
      <Stack gap="sm">
        <Alert color="danger" variant="light" icon={<Icon name="alert" size={14} />}>
          {t('room.removeHint', { prefix, name: room.name })}
        </Alert>

        <Stack gap={4}>
          <Detail label={t('dashboard.roomName')}>
            <Text size="xs" ff="monospace">
              {prefix}/{room.name}
            </Text>
          </Detail>
          {room.title && <Detail label={t('room.removeTitle')}>{room.title}</Detail>}
          {room.status && <Detail label={t('room.removeStatus')}>{room.status}</Detail>}
          <Detail label={t('room.removeCreated')}>{stamp(room.createdAt, lang)}</Detail>
          <Detail label={t('room.removeUpdated')}>{stamp(room.updatedAt, lang)}</Detail>
          <Detail label={t('room.removeSnapshot')}>
            {room.hasThumb ? (
              <Text size="xs" ff="monospace">
                {room.thumbUrl ? room.thumbUrl.split('/').pop() : 'png'}
              </Text>
            ) : (
              t('room.removeNoSnapshot')
            )}
          </Detail>
        </Stack>

        {referenced && (
          <>
            <Alert color="warning" variant="light" icon={<Icon name="alert" size={14} />}>
              {t('room.removeReferenced', { rooms: referencing.join(', ') })}
            </Alert>
            <Checkbox
              size="xs"
              checked={force}
              onChange={(event) => setForce(event.currentTarget.checked)}
              label={t('room.removeForce')}
            />
          </>
        )}

        <TextInput
          label={t('room.removeConfirm', { name: room.name })}
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          autoComplete="off"
          spellCheck={false}
          styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canDelete) void submit();
          }}
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
            color="danger"
            size="compact-sm"
            onClick={() => void submit()}
            disabled={!canDelete}
            loading={busy}
            leftSection={<Icon name="trash" size={14} />}
          >
            {busy ? t('room.removing') : t('room.removeAction')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
