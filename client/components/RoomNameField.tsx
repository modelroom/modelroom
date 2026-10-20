// The room-name input, shared by the add and the rename dialogs: a text field
// with a ✓ or ✘ that appears as you type, and the one sentence that says why.
//
// The check is `client/lib/roomname.ts` — the browser's copy of the server's
// rule. The server still refuses on submit; this only spares the round trip.

import { Box, Text, TextInput } from '@mantine/core';
import { roomNameCheck } from '../lib/roomname.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';

export function RoomNameField({
  value,
  onChange,
  names,
  current,
  label,
  placeholder,
  autoFocus = false,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Every existing room: what "already exists" is checked against. */
  names: readonly string[];
  /** The room's own name, when renaming: equal to it changes nothing. */
  current?: string;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  const { t } = useI18n();
  const check = roomNameCheck(value, names, current);

  const message = check.same
    ? t('room.renameSame')
    : check.issue === 'invalid'
      ? t('dashboard.roomNameInvalid')
      : check.issue === 'taken'
        ? t(check.collide === value.trim() ? 'dashboard.roomNameTaken' : 'dashboard.roomNameCase', {
            name: check.collide ?? '',
          })
        : check.issue === 'ok'
          ? t('dashboard.roomNameOk')
          : null;
  const tone = check.valid ? 'success' : check.issue === 'empty' ? 'dimmed' : 'danger';

  return (
    <Box>
      <TextInput
        label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && check.valid) onEnter?.();
        }}
        rightSection={
          check.issue === 'empty' ? undefined : (
            <Box c={tone} style={{ display: 'flex' }}>
              <Icon name={check.valid ? 'check' : 'x'} size={16} />
            </Box>
          )
        }
        rightSectionPointerEvents="none"
        styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
      />
      {message && (
        <Text size="xs" c={tone} mt={4}>
          {message}
        </Text>
      )}
    </Box>
  );
}
