// The room's own operations, in its header: a pencil to rename and a ⋯ menu that
// gathers rename and delete. Both dialogs live here, so the room page only drops
// this one component next to the name.
//
// Renaming lands on the room's new address — the directory is the room, so the
// URL has to move with it. Deleting goes back to the dashboard.

import { useState } from 'react';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import type { RoomInfo } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from '../components/Icon.tsx';
import { DeleteRoomDialog } from '../components/DeleteRoomDialog.tsx';
import { RenameRoomDialog } from '../components/RenameRoomDialog.tsx';

export function RoomActions({
  room,
  names,
  prefix,
}: {
  room: RoomInfo;
  names: readonly string[];
  prefix: string;
}) {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);

  const open = (to: string) => window.location.assign(`/rooms/${encodeURIComponent(to)}`);

  return (
    <>
      <Tooltip label={t('room.rename')} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="md"
          aria-label={t('room.rename')}
          onClick={() => setRenaming(true)}
        >
          <Icon name="pencil" size={15} />
        </ActionIcon>
      </Tooltip>
      <Menu position="bottom-end" withArrow>
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="md" aria-label={t('room.menu')}>
            <Icon name="more" size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil" size={14} />}
            onClick={() => setRenaming(true)}
          >
            {t('room.rename')}
          </Menu.Item>
          <Menu.Item
            color="danger"
            leftSection={<Icon name="trash" size={14} />}
            onClick={() => setRemoving(true)}
          >
            {t('room.remove')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <RenameRoomDialog
        opened={renaming}
        onClose={() => setRenaming(false)}
        current={room.name}
        names={names}
        prefix={prefix}
        onRenamed={open}
      />
      <DeleteRoomDialog
        opened={removing}
        onClose={() => setRemoving(false)}
        room={room}
        prefix={prefix}
        onDeleted={() => window.location.assign('/')}
      />
    </>
  );
}
