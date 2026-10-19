import { test } from 'vitest';
import assert from 'node:assert/strict';
import { en, ja, t } from '../../lib/i18n.ts';
import { detectLang, normalizeLang, parseLangAnswer } from '../../lib/locale.ts';

test('every English key has a Japanese translation', () => {
  for (const key of Object.keys(en)) {
    assert.equal(typeof ja[key], 'string', `missing Japanese translation: ${key}`);
    assert.notEqual(ja[key].trim(), '', `empty Japanese translation: ${key}`);
  }
  assert.deepEqual(Object.keys(ja).sort(), Object.keys(en).sort());
});

test('t interpolates and falls back to English for unknown languages', () => {
  assert.equal(
    t('en', 'lint.reserved-type', { key: 'tags', allowed: 'array', got: 'string' }),
    'tags must be array, got string',
  );
  assert.equal(
    t('ja', 'lint.reserved-type', { key: 'tags', allowed: 'array', got: 'string' }),
    'tags は array である必要があります（実際は string）',
  );
  assert.equal(t('fr', 'common.ready'), 'ready');
  assert.equal(t('en', 'common.ready'), 'ready');
});

test('language detection normalises shell and OS spellings', () => {
  assert.equal(normalizeLang('ja_JP.UTF-8'), 'ja');
  assert.equal(normalizeLang('ja-JP'), 'ja');
  assert.equal(normalizeLang('Japanese_Japan'), 'ja');
  assert.equal(normalizeLang('en_US.UTF-8'), 'en');
  assert.equal(normalizeLang('C'), 'en');

  assert.deepEqual(detectLang({ LANG: 'ja_JP.UTF-8' }), { lang: 'ja', source: 'env' });
  assert.deepEqual(detectLang({ LC_ALL: 'en_US.UTF-8', LANG: 'ja_JP.UTF-8' }), {
    lang: 'en',
    source: 'env',
  });
  assert.deepEqual(detectLang({ MODELROOM_LANG: 'ja' }), { lang: 'ja', source: 'env' });
});

test('the install prompt accepts short and native answers', () => {
  assert.equal(parseLangAnswer('ja'), 'ja');
  assert.equal(parseLangAnswer('j'), 'ja');
  assert.equal(parseLangAnswer('日本語'), 'ja');
  assert.equal(parseLangAnswer('en'), 'en');
  assert.equal(parseLangAnswer('english'), 'en');
  assert.equal(parseLangAnswer('おまかせ'), null);
});
