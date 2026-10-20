// The agent's question, docked above the composer.
//
// A coding agent that needs a decision stops and asks. The turn is blocked on
// that answer, so the question has to be visible and answerable from the chat —
// that is the whole point of driving opencode through its own server. The shape
// is the driver-agnostic `Ask` (api/chat.ts), so the same card would show a
// Claude Code question when that driver exists.
//
// One question at a time is enough: the agent asks, the person answers, the turn
// carries on. A question with options is a choice; a free-form answer is always
// allowed, because the tool says so.

import { useState } from 'react';
import { Box, Button, Checkbox, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import type { Ask, AskAnswer } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from './Icon.tsx';

interface FieldState {
  choices: string[];
  text: string;
}

const optionLabel = (label: string, description?: string): string =>
  description ? `${label} — ${description}` : label;

export function QuestionCard({
  ask,
  onSubmit,
  onDismiss,
}: {
  ask: Ask;
  onSubmit: (askId: string, answer: AskAnswer) => void;
  onDismiss: (askId: string) => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(ask.questions.map((question) => [question.key, { choices: [], text: '' }])),
  );
  const [sending, setSending] = useState(false);

  const patch = (key: string, next: Partial<FieldState>) =>
    setValues((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { choices: [], text: '' }), ...next },
    }));

  // The answer the card adds up to: the options chosen, plus any typed answer. A
  // single choice prefers what was typed, so "type your own" wins over a radio.
  const answer: AskAnswer = {};
  for (const question of ask.questions) {
    const value = values[question.key] ?? { choices: [], text: '' };
    const typed = value.text.trim();
    const chosen = question.multiple
      ? [...value.choices, ...(typed ? [typed] : [])]
      : typed
        ? [typed]
        : value.choices.slice(0, 1);
    if (chosen.length) answer[question.key] = chosen;
  }
  const canSubmit = Object.keys(answer).length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setSending(true);
    onSubmit(ask.id, answer);
  };

  return (
    <Box
      data-part="ask"
      mx="xs"
      mb="xs"
      p="sm"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mr-subtle)',
      }}
    >
      <Group gap={6} wrap="nowrap" mb={6}>
        <Icon name="sparkles" size={14} />
        <Text size="xs" fw={500}>
          {ask.title?.trim() || t('ask.title')}
        </Text>
      </Group>

      <Stack gap="sm">
        {ask.questions.map((question) => {
          const value = values[question.key] ?? { choices: [], text: '' };
          return (
            <Box key={question.key}>
              <Text size="sm" fw={500}>
                {question.header || question.question}
              </Text>
              {question.header && question.question && question.header !== question.question && (
                <Text size="xs" c="dimmed">
                  {question.question}
                </Text>
              )}

              {question.options.length > 0 &&
                (question.multiple ? (
                  <Checkbox.Group
                    value={value.choices}
                    onChange={(next) => patch(question.key, { choices: next })}
                    mt={4}
                  >
                    <Stack gap={2}>
                      {question.options.map((option) => (
                        <Checkbox
                          key={option.label}
                          value={option.label}
                          size="xs"
                          label={optionLabel(option.label, option.description)}
                        />
                      ))}
                    </Stack>
                  </Checkbox.Group>
                ) : (
                  <Radio.Group
                    value={value.choices[0] ?? null}
                    onChange={(next) => patch(question.key, { choices: next ? [next] : [] })}
                    mt={4}
                  >
                    <Stack gap={2}>
                      {question.options.map((option) => (
                        <Radio
                          key={option.label}
                          value={option.label}
                          size="xs"
                          label={optionLabel(option.label, option.description)}
                        />
                      ))}
                    </Stack>
                  </Radio.Group>
                ))}

              <TextInput
                size="xs"
                mt={question.options.length > 0 ? 6 : 4}
                placeholder={t('ask.custom')}
                aria-label={t('ask.custom')}
                value={value.text}
                onChange={(event) => patch(question.key, { text: event.currentTarget.value })}
              />
              {question.multiple && (
                <Text size="xs" c="dimmed" mt={2}>
                  {t('ask.multiple')}
                </Text>
              )}
            </Box>
          );
        })}
      </Stack>

      <Group justify="flex-end" gap="xs" mt="sm">
        <Button variant="subtle" color="gray" size="compact-sm" onClick={() => onDismiss(ask.id)}>
          {t('ask.dismiss')}
        </Button>
        <Button
          size="compact-sm"
          disabled={!canSubmit || sending}
          leftSection={<Icon name="send" size={13} />}
          onClick={submit}
        >
          {t('ask.submit')}
        </Button>
      </Group>
    </Box>
  );
}
