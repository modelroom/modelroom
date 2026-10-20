// modelroom — the one prompt the CLI shows.
//
// An arrow-key selector built on `node:readline` in raw mode: no dependency, no
// second prompt, nothing to install. `init`'s language question is its only
// caller — the policy behind that question lives in bin/langchoice.ts.

import { emitKeypressEvents, type Key } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/** A choice and the words for it. */
export interface Choice<T> {
  value: T;
  label: string;
}

/** Where the prompt reads and writes. Injectable so a test can drive it. */
export interface PromptStreams {
  input: Readable & { setRawMode?(mode: boolean): void };
  output: Writable;
}

export interface SelectOptions {
  /** The index the cursor starts on. Out of range values are clamped. */
  initial?: number;
  streams?: PromptStreams;
  /**
   * The line to leave behind if Escape is pressed. Escape then cancels: the
   * promise resolves with `undefined` instead of a choice, so a caller can tell
   * "the person said no" from "the person accepted the default".
   */
  cancelLine?: string;
}

/** Up and down wrap around the list, so the cursor never leaves it. */
export function step(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** The choices as drawn: one line each, the active one marked. Exported for the test. */
export function draw<T>(choices: ReadonlyArray<Choice<T>>, active: number): string[] {
  return choices.map((choice, i) => `${i === active ? '❯' : ' '} ${choice.label}`);
}

/** The line the question leaves behind: `✔ language  ja`. */
export function answerLine(question: string, label: string): string {
  return `✔ ${question}  ${label}`;
}

/** The line it leaves behind when the person keeps what was already there. */
export function keptLine(question: string, note: string): string {
  return `– ${question}  ${note}`;
}

/**
 * Ask one question. Enter takes the value under the cursor; when a `cancelLine`
 * is given, Escape cancels and the promise resolves with `undefined`, otherwise
 * Escape keeps the starting value. Arrow keys (and `j` / `k`) move the cursor,
 * and `Ctrl+C` leaves the way any other command does.
 */
export async function select<T>(
  question: string,
  choices: ReadonlyArray<Choice<T>>,
  options: SelectOptions = {},
): Promise<T | undefined> {
  if (!choices.length) throw new Error('select needs at least one choice');
  const input = options.streams?.input ?? process.stdin;
  const output = options.streams?.output ?? process.stdout;
  const count = choices.length;
  const start = Math.min(Math.max(options.initial ?? 0, 0), count - 1);
  let active = start;
  let done = false;

  const at = (index: number): T => (choices[index] as Choice<T>).value;
  const label = (index: number): string => choices[index]?.label ?? '';

  // Raw mode is what turns an arrow key into `key.name === 'up'` instead of the
  // three characters a line-oriented read would deliver.
  input.setRawMode?.(true);
  input.resume();
  emitKeypressEvents(input);

  output.write(`${question}\n${draw(choices, active).join('\n')}`);

  return new Promise<T | undefined>((resolve) => {
    // Raw mode turns off the terminal's own echo and line editing. Whatever gets
    // us out — an answer, Escape, Ctrl+C, the stream closing, or a crash — put it
    // back, so the shell is never left half-raw.
    const restore = (): void => {
      input.setRawMode?.(false);
    };
    process.once('exit', restore);
    const redraw = (): void => {
      // A single choice cannot move; rewriting it would scroll the question away.
      if (count < 2) return;
      // The cursor sits at the end of the last choice: go back to the first and
      // overwrite every line, clearing the tail of each as we go.
      output.write(`\x1b[${count - 1}A`);
      output.write(
        draw(choices, active)
          .map((line) => `\r\x1b[2K${line}`)
          .join('\n'),
      );
    };
    const leave = (): void => {
      process.off('exit', restore);
      input.off('keypress', onKey);
      input.off('end', onEnd);
      input.off('close', onEnd);
      restore();
      input.pause();
    };
    // Clear the question and the choices, and leave `line` in their place.
    const settle = (line: string, value: T | undefined): void => {
      if (done) return;
      done = true;
      leave();
      output.write(`\x1b[${count}A\r\x1b[0J${line}\n`);
      resolve(value);
    };
    const onKey = (_str: string | undefined, key: Key): void => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        leave();
        output.write('\n');
        process.exit(130);
      } else if (key.name === 'up' || key.name === 'k') {
        active = step(active, count, -1);
        redraw();
      } else if (key.name === 'down' || key.name === 'j') {
        active = step(active, count, 1);
        redraw();
      } else if (key.name === 'return' || key.name === 'enter') {
        settle(answerLine(question, label(active)), at(active));
      } else if (key.name === 'escape') {
        // Escape says no to the question, not to the cursor's position: with a
        // `cancelLine` it cancels, and without one it keeps what was there.
        if (options.cancelLine === undefined) settle(answerLine(question, label(start)), at(start));
        else settle(options.cancelLine, undefined);
      }
    };
    // The stream ending is the terminal going away — never leave the caller waiting.
    const onEnd = (): void => settle(options.cancelLine ?? '', undefined);
    input.on('keypress', onKey);
    input.once('end', onEnd);
    input.once('close', onEnd);
  });
}
