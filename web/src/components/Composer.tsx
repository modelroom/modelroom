// The composer. Auto-grows, remembers your draft, walks your prompt history, and
// — the point of it — keeps working while the agent is busy: Enter queues.
//
// The field is Mantine's `Textarea` in autosize mode; the queue is a row of
// pills, each with a close button the caller owns.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Badge, Box, Button, CloseButton, Group, Text, Textarea } from '@mantine/core';
import { load, save } from '../lib/storage.ts';
import { Icon } from './Icon.tsx';

const HISTORY_MAX = 50;

export function Composer({
  room,
  running,
  queue,
  onSubmit,
  onRemoveQueued,
}: {
  room: string;
  running: boolean;
  queue: string[];
  onSubmit: (text: string) => void;
  onRemoveQueued: (index: number) => void;
}) {
  const draftKey = `modelroom.draft.${room}`;
  const historyKey = `modelroom.history.${room}`;
  const [value, setValue] = useState(() => load<string>(draftKey, ''));
  const [history, setHistory] = useState<string[]>(() => load<string[]>(historyKey, []));
  const [cursor, setCursor] = useState<number | null>(null);
  const draft = useRef('');

  useEffect(() => {
    save(draftKey, value);
  }, [draftKey, value]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
    setCursor(null);
    const next = history.at(-1) === text ? history : [...history, text].slice(-HISTORY_MAX);
    setHistory(next);
    save(historyKey, next);
  };

  const walkHistory = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    if (event.key === 'ArrowUp') {
      const atStart =
        element.selectionStart === element.selectionEnd &&
        !element.value.slice(0, element.selectionStart).includes('\n');
      if (!history.length || (cursor === null && !atStart)) return;
      event.preventDefault();
      if (cursor === null) {
        draft.current = element.value;
        setCursor(history.length);
      }
      const index = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(index);
      setValue(history[index] ?? '');
      return;
    }
    if (event.key === 'ArrowDown' && cursor !== null) {
      event.preventDefault();
      if (cursor < history.length - 1) {
        setCursor(cursor + 1);
        setValue(history[cursor + 1] ?? '');
      } else {
        setCursor(null);
        setValue(draft.current);
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return; // let the IME finish the word
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    walkHistory(event);
  };

  return (
    <Box
      p="xs"
      style={{ borderTop: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
    >
      {queue.length > 0 && (
        <Group gap="xs" pb="xs" wrap="wrap">
          {queue.map((text, index) => (
            <Badge
              key={`${index}-${text}`}
              variant="light"
              color="gray"
              size="lg"
              radius="sm"
              leftSection={<Icon name="clock" size={12} />}
              rightSection={
                <CloseButton
                  size="xs"
                  aria-label={`Remove queued prompt: ${text}`}
                  onClick={() => onRemoveQueued(index)}
                />
              }
            >
              <Text size="xs" truncate style={{ maxWidth: '16rem' }}>
                {text}
              </Text>
            </Badge>
          ))}
        </Group>
      )}

      <Box
        p={6}
        style={{
          borderRadius: 'var(--mantine-radius-lg)',
          border: '1px solid var(--mantine-color-default-border)',
          backgroundColor: 'var(--mantine-color-body)',
        }}
      >
        <Textarea
          variant="unstyled"
          autosize
          minRows={1}
          maxRows={8}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setCursor(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent to change this room. It edits the room's files; the artifact updates here."
          aria-label="Message the agent"
          classNames={{ input: 'mr-scroll' }}
        />
        <Group gap="sm" px={6} pt={2} wrap="nowrap">
          <Text size="xs" c="dimmed" visibleFrom="sm">
            Enter to send · Shift+Enter for a new line
          </Text>
          <Group gap="sm" ml="auto" wrap="nowrap">
            {running && (
              <Group gap={4} wrap="nowrap" visibleFrom="sm">
                <Icon name="sparkles" size={12} />
                <Text size="xs" c="dimmed">
                  agent is working…
                </Text>
              </Group>
            )}
            <Button
              size="compact-sm"
              disabled={!value.trim()}
              onClick={submit}
              leftSection={<Icon name="send" size={14} />}
            >
              {running ? 'Queue' : 'Send'}
            </Button>
          </Group>
        </Group>
      </Box>
    </Box>
  );
}
