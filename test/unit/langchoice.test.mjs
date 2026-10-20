// modelroom — which language `init` settles on, and why.
//
// `init` cannot be driven with a terminal in a test, so the decision it makes
// between a flag, a pinned config, a prompt answer and the environment is pulled
// out into pure functions and tested here, in full.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { configLanguage, resolveInitLang, shouldAskLang } from '../../bin/langchoice.ts';

test('configLanguage reads only a language we ship', () => {
  assert.equal(configLanguage('{ "lang": "ja" }'), 'ja');
  assert.equal(configLanguage('{ "root": ".", "lang": "en" }'), 'en');
  assert.equal(configLanguage('{ "lang": "de" }'), undefined); // not one of ours
  assert.equal(configLanguage('{ "lang": 7 }'), undefined);
  assert.equal(configLanguage('{ "rooms": "rooms" }'), undefined);
  assert.equal(configLanguage(''), undefined); // no config
  assert.equal(configLanguage('{ "lang": "ja"'), undefined); // not JSON
});

test('init asks only at a terminal, when nobody has pinned the language', () => {
  assert.equal(shouldAskLang({ interactive: true }), true);
  assert.equal(shouldAskLang({ interactive: false }), false); // a pipe, or CI
  assert.equal(shouldAskLang({ interactive: true, explicit: 'ja' }), false); // --lang
  assert.equal(shouldAskLang({ interactive: true, configLang: 'en' }), false); // pinned
});

test('an answer to the prompt pins the language, and is reported as chosen', () => {
  const choice = resolveInitLang({
    detected: { lang: 'en', source: 'env' },
    answer: 'ja',
  });
  assert.deepEqual(choice, { lang: 'ja', source: 'prompt', write: true });
});

test('--lang pins, and outranks the config and the environment', () => {
  assert.deepEqual(
    resolveInitLang({
      explicit: 'ja',
      configLang: 'en',
      detected: { lang: 'en', source: 'env' },
    }),
    { lang: 'ja', source: 'flag', write: true },
  );
});

test("the config's own lang is honoured and left alone", () => {
  assert.deepEqual(resolveInitLang({ configLang: 'ja', detected: { lang: 'en', source: 'env' } }), {
    lang: 'ja',
    source: 'config',
    write: false,
  });
});

test('with nothing pinned, the detected language is used and not written', () => {
  assert.deepEqual(resolveInitLang({ detected: { lang: 'ja', source: 'env' } }), {
    lang: 'ja',
    source: 'env',
    write: false,
  });
  assert.deepEqual(resolveInitLang({ detected: { lang: 'en', source: 'default' } }), {
    lang: 'en',
    source: 'default',
    write: false,
  });
});

test('an escaped prompt falls through to detection, exactly like a script', () => {
  // `answer: undefined` is Escape — nothing is written, keep detecting.
  assert.deepEqual(
    resolveInitLang({ detected: { lang: 'ja', source: 'env' }, answer: undefined }),
    { lang: 'ja', source: 'env', write: false },
  );
});
