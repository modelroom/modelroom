// The dashboard's filter control, built from Mantine's own parts.
//
// The rule (from the migration brief) is a size rule:
//
//   · ≤ 500 candidates, already on the client → `MultiSelect` / `Select`.
//     They search, clear, take keyboard focus and announce themselves, and they
//     are the whole control — nothing here is hand-rolled.
//   · > 500 candidates → `Combobox` + `useVirtualizedCombobox` +
//     `@tanstack/react-virtual`. Only the visible rows exist in the DOM, so the
//     list stays flat at any size. `keepMounted`,
//     `resetSelectionOnOptionHover={false}` and `ScrollArea.Autosize` are set as
//     the brief asks.
//
// Both paths write the same thing: a list of chosen values. The dashboard keeps
// that list in the URL, so a filter is shareable and survives a reload.
//
// Keyboard, in both paths: ↑/↓ move, Enter selects, Esc closes, Backspace on an
// empty search removes the last chip, Tab leaves.

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Box,
  Combobox,
  Group,
  Pill,
  ScrollArea,
  MultiSelect,
  Select,
  Text,
  TextInput,
  useVirtualizedCombobox,
  type ComboboxItem,
  type OptionsFilter,
} from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Facet } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { filterOptions } from './filter.ts';

/** Candidates past this count get the virtualised control. */
export const SYNC_LIMIT = 500;

/** How many chips a multi-select shows before summarising the rest. */
const MAX_PILLS = 3;

/** Options a plain (non-virtualised) dropdown renders at once. */
const RENDER_LIMIT = 200;

const ROW_HEIGHT = 34;

interface Option {
  value: string;
  label: string;
  count: number;
}

const optionData = (facet: Facet): Option[] =>
  facet.values.map((entry) => ({ value: entry.value, label: entry.value, count: entry.count }));

/** The label is the value; the count rides on the right so search stays clean. */
function OptionRow({
  label,
  count,
  checked,
}: {
  label: string;
  count?: number;
  checked?: boolean;
}) {
  return (
    <Group gap="xs" wrap="nowrap" w="100%" style={{ minWidth: 0 }}>
      <Text size="sm" truncate title={label} style={{ minWidth: 0 }} fw={checked ? 600 : 400}>
        {label}
      </Text>
      {count !== undefined && (
        <Text size="xs" c="dimmed" ml="auto" ff="monospace">
          {count}
        </Text>
      )}
    </Group>
  );
}

const labelStyles = {
  label: {
    textTransform: 'uppercase' as const,
    fontSize: 11,
    letterSpacing: '0.04em',
    fontWeight: 500,
    color: 'var(--mantine-color-dimmed)',
    marginBottom: 4,
  },
};

const fieldWidth = { minWidth: 144, maxWidth: 256 } as const;

/** The facet's own matcher, so a query reads the value the same way the server does. */
function useFacetFilter(): OptionsFilter {
  return useCallback<OptionsFilter>(({ options, search }) => {
    const flat = options.filter(
      (option): option is ComboboxItem => 'value' in option && 'label' in option,
    );
    return filterOptions(flat, search);
  }, []);
}

function MultiFacet({
  facet,
  selected,
  onChange,
  options,
}: {
  facet: Facet;
  selected: string[];
  onChange: (next: string[]) => void;
  options: Option[];
}) {
  const { t } = useI18n();
  const filter = useFacetFilter();
  const counts = useMemo(() => new Map(options.map((o) => [o.value, o.count])), [options]);

  return (
    <Box style={fieldWidth}>
      <MultiSelect
        label={facet.key}
        styles={labelStyles}
        size="xs"
        searchable
        clearable
        hidePickedOptions
        limit={RENDER_LIMIT}
        filter={filter}
        nothingFoundMessage={t('facet.noMatch')}
        maxDropdownHeight={280}
        comboboxProps={{ keepMounted: false, resetSelectionOnOptionHover: false }}
        placeholder={selected.length ? undefined : t('facet.any')}
        data={options.map((option) => ({ value: option.value, label: option.label }))}
        value={selected}
        onChange={onChange}
        renderOption={({ option, checked }) => (
          <OptionRow label={option.label} count={counts.get(option.value)} checked={checked} />
        )}
        // Keep the chip row from growing without bound on a long selection: the
        // first chips stay, the last one summarises the rest.
        renderPill={({ option, onRemove }) => {
          const index = selected.indexOf(String(option.value));
          if (selected.length <= MAX_PILLS || index < MAX_PILLS - 1) {
            return (
              <Pill withRemoveButton onRemove={onRemove} size="sm">
                {option.label}
              </Pill>
            );
          }
          if (index === MAX_PILLS - 1) {
            return (
              <Pill size="sm" title={selected.slice(MAX_PILLS - 1).join(', ')}>
                {t('facet.more', { count: selected.length - MAX_PILLS + 1 })}
              </Pill>
            );
          }
          return null;
        }}
      />
    </Box>
  );
}

function SingleFacet({
  facet,
  selected,
  onChange,
  options,
}: {
  facet: Facet;
  selected: string[];
  onChange: (next: string[]) => void;
  options: Option[];
}) {
  const { t } = useI18n();
  const filter = useFacetFilter();
  const counts = useMemo(() => new Map(options.map((o) => [o.value, o.count])), [options]);

  return (
    <Box style={fieldWidth}>
      <Select
        label={facet.key}
        styles={labelStyles}
        size="xs"
        searchable
        clearable
        limit={RENDER_LIMIT}
        filter={filter}
        nothingFoundMessage={t('facet.noMatch')}
        maxDropdownHeight={280}
        comboboxProps={{ keepMounted: false, resetSelectionOnOptionHover: false }}
        placeholder={t('facet.any')}
        data={options.map((option) => ({ value: option.value, label: option.label }))}
        value={selected[0] ?? null}
        onChange={(value) => onChange(value ? [value] : [])}
        renderOption={({ option, checked }) => (
          <OptionRow label={option.label} count={counts.get(option.value)} checked={checked} />
        )}
      />
    </Box>
  );
}

/**
 * The same facet, for a candidate list too long to put in the DOM: a Combobox
 * whose options are windowed by `@tanstack/react-virtual`.
 */
function VirtualFacet({
  facet,
  selected,
  onChange,
  options,
}: {
  facet: Facet;
  selected: string[];
  onChange: (next: string[]) => void;
  options: Option[];
}) {
  const { t } = useI18n();
  const multiple = facet.kind === 'array';
  const [search, setSearch] = useState('');
  const [opened, setOpened] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const idPrefix = useId();

  const filtered = useMemo(() => filterOptions(options, search), [options, search]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const getOptionId = useCallback(
    (index: number) => (filtered[index] ? `${idPrefix}-${index}` : null),
    [filtered, idPrefix],
  );

  const submit = useCallback(
    (value: string) => {
      if (multiple) {
        onChange(
          selected.includes(value)
            ? selected.filter((entry) => entry !== value)
            : [...selected, value],
        );
        setSearch('');
        setActiveIndex(-1);
        return;
      }
      onChange([value]);
      setSearch('');
      setOpened(false);
    },
    [multiple, onChange, selected],
  );

  const combobox = useVirtualizedCombobox({
    opened,
    onOpenedChange: setOpened,
    totalOptionsCount: filtered.length,
    getOptionId,
    selectedOptionIndex: activeIndex,
    setSelectedOptionIndex: setActiveIndex,
    onSelectedOptionSubmit: (index) => {
      const option = filtered[index];
      if (option) submit(option.value);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace on an empty search peels the last chip, the way a plain
    // multi-select does.
    if (
      event.key === 'Backspace' &&
      multiple &&
      search.length === 0 &&
      selected.length > 0 &&
      event.currentTarget.selectionStart === 0
    ) {
      event.preventDefault();
      onChange(selected.slice(0, -1));
    }
    if (event.key === 'Tab') combobox.closeDropdown();
  };

  const items = virtualizer.getVirtualItems();

  return (
    <Box style={fieldWidth}>
      {multiple && selected.length > 0 && (
        <Group gap={4} mb={4} wrap="wrap">
          {selected.map((value) => (
            <Pill
              key={value}
              withRemoveButton
              onRemove={() => onChange(selected.filter((entry) => entry !== value))}
              size="sm"
            >
              {value}
            </Pill>
          ))}
        </Group>
      )}
      <Combobox
        store={combobox}
        keepMounted
        resetSelectionOnOptionHover={false}
        onOptionSubmit={submit}
      >
        <Combobox.Target withExpandedAttribute>
          <TextInput
            label={facet.key}
            styles={labelStyles}
            size="xs"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setActiveIndex(-1);
              combobox.openDropdown();
            }}
            onKeyDown={onKeyDown}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            placeholder={
              multiple
                ? selected.length
                  ? t('facet.searchValues', { count: options.length })
                  : t('facet.searchOrPick')
                : (selected[0] ?? t('facet.searchOrPick'))
            }
            aria-label={t('common.filter', { name: facet.key })}
            rightSection={
              search ? (
                <Text size="xs" c="dimmed" ff="monospace">
                  {filtered.length}
                </Text>
              ) : undefined
            }
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options>
            <ScrollArea.Autosize
              mah={280}
              type="auto"
              viewportRef={viewportRef}
              onMouseDown={(event) => event.preventDefault()}
            >
              {filtered.length === 0 ? (
                <Combobox.Empty>{t('facet.noMatch')}</Combobox.Empty>
              ) : (
                <Box style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
                  {items.map((item) => {
                    const option = filtered[item.index];
                    if (!option) return null;
                    return (
                      <Combobox.Option
                        key={option.value}
                        value={option.value}
                        id={getOptionId(item.index) ?? undefined}
                        active={item.index === activeIndex}
                        selected={selected.includes(option.value)}
                        style={{
                          position: 'absolute',
                          top: item.start,
                          left: 0,
                          width: '100%',
                          height: item.size,
                        }}
                      >
                        <OptionRow
                          label={option.label}
                          count={option.count}
                          checked={selected.includes(option.value)}
                        />
                      </Combobox.Option>
                    );
                  })}
                </Box>
              )}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </Box>
  );
}

export function FacetFilter({
  facet,
  selected,
  onChange,
}: {
  facet: Facet;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const options = useMemo(() => optionData(facet), [facet]);
  const shared = { facet, selected, onChange, options };

  if (options.length > SYNC_LIMIT) return <VirtualFacet {...shared} />;
  if (facet.kind === 'array') return <MultiFacet {...shared} />;
  return <SingleFacet {...shared} />;
}
