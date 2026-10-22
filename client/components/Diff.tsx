// The rendered diff: hunks of added, removed and context lines, in the UI's
// mono font. The line numbers are the ones the two files carry, so a hunk can be
// read against the file itself.

import { useMemo } from 'react';
import { Box, Text } from '@mantine/core';
import { diffLines, type DiffHunk, type DiffLineKind } from '../lib/diff.ts';

const SIGN: Record<DiffLineKind, string> = { same: ' ', add: '+', del: '-' };

function HunkView({ hunk }: { hunk: DiffHunk }) {
  let beforeNo = hunk.beforeStart;
  let afterNo = hunk.afterStart;
  return (
    <Box>
      {hunk.lines.map((line, index) => {
        const before = line.kind === 'add' ? '' : String(beforeNo++);
        const after = line.kind === 'del' ? '' : String(afterNo++);
        return (
          <Box key={index} className={`mr-diff-line mr-diff-${line.kind}`}>
            <Text component="span" className="mr-diff-no">
              {before}
            </Text>
            <Text component="span" className="mr-diff-no">
              {after}
            </Text>
            <Text component="span" className="mr-diff-sign">
              {SIGN[line.kind]}
            </Text>
            <Text component="span" className="mr-diff-text">
              {line.text || ' '}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

export function Diff({ before, after }: { before: string; after: string }) {
  const hunks = useMemo(() => diffLines(before, after), [before, after]);
  if (!hunks.length) return null;
  return (
    <Box className="mr-scroll mr-diff" p="sm">
      {hunks.map((hunk, index) => (
        <Box key={index}>
          {index > 0 && (
            <Text className="mr-diff-gap" size="xs" c="dimmed" ta="center" py={4}>
              ⋯
            </Text>
          )}
          <HunkView hunk={hunk} />
        </Box>
      ))}
    </Box>
  );
}
