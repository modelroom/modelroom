// modelroom — the update check.
//
// The one piece of modelroom that talks to the outside world, so the tests hold
// it to the two promises that make that acceptable: it never throws, and it
// never says "update" when it cannot tell.

import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  CHECK_TTL_MS,
  compareVersions,
  fetchLatest,
  isNewer,
  parseVersion,
  updateCheckDisabled,
  checkForUpdate,
} from '../../core/update.ts';

/** The registry, with no network: one canned answer, and a count of the calls. */
function stub(response) {
  const calls = [];
  const fetcher = (url) => {
    calls.push(url);
    if (response instanceof Error) return Promise.reject(response);
    return Promise.resolve({ ok: true, json: async () => ({ version: '1.2.3' }), ...response });
  };
  return { fetcher, calls };
}

const json = (body, ok = true) => ({
  ok,
  json: async () => body,
});

test('parseVersion reads a release and a prerelease, and refuses the rest', () => {
  assert.deepEqual(parseVersion('1.2.3'), { parts: [1, 2, 3], pre: null });
  assert.deepEqual(parseVersion('v1.2.3'), { parts: [1, 2, 3], pre: null });
  assert.deepEqual(parseVersion('  0.6.0  '), { parts: [0, 6, 0], pre: null });
  assert.deepEqual(parseVersion('1.0.0-rc.1'), { parts: [1, 0, 0], pre: 'rc.1' });

  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(parseVersion(''), null);
});

test('compareVersions orders releases, and releases above their prereleases', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersions('0.6.0', '0.5.0'), 1);
  assert.equal(compareVersions('0.5.0', '0.6.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.9.10', '0.9.9'), 1); // not a string compare

  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.9'), 1);
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1); // numeric sorts first
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.2'), 0);

  // Unreadable is not "older": it is nothing to say.
  assert.equal(compareVersions('nonsense', '1.2.3'), 0);
});

test('isNewer stays quiet when the checkout is ahead of the registry', () => {
  // This repository's own state while 0.6.0 is unreleased: the answer is 0.5.0.
  assert.equal(isNewer('0.5.0', '0.6.0'), false);
  assert.equal(isNewer('0.6.0', '0.6.0'), false);
  assert.equal(isNewer('0.6.0', '0.5.0'), true);
  assert.equal(isNewer(null, '0.5.0'), false);
});

test('fetchLatest answers only for something that reads as a version', async () => {
  const ok = stub(json({ version: '1.2.3' }));
  assert.equal(await fetchLatest(ok.fetcher), '1.2.3');
  assert.deepEqual(ok.calls, ['https://registry.npmjs.org/modelroom/latest']);

  assert.equal(await fetchLatest(stub(json({ version: 'not a version' })).fetcher), null);
  assert.equal(await fetchLatest(stub(json({}, false)).fetcher), null);
  assert.equal(await fetchLatest(stub(json('1.2.3')).fetcher), null);
  assert.equal(await fetchLatest(stub(new Error('offline')).fetcher), null);
  assert.equal(await fetchLatest(stub(new Error('The operation was aborted')).fetcher, 10), null);
});

test('updateCheckDisabled reads the one variable, and only its yes', () => {
  assert.equal(updateCheckDisabled({ MODELROOM_NO_UPDATE_CHECK: '1' }), true);
  assert.equal(updateCheckDisabled({ MODELROOM_NO_UPDATE_CHECK: 'yes' }), true);
  assert.equal(updateCheckDisabled({ MODELROOM_NO_UPDATE_CHECK: '0' }), false);
  assert.equal(updateCheckDisabled({ MODELROOM_NO_UPDATE_CHECK: 'false' }), false);
  assert.equal(updateCheckDisabled({}), false);
});

test('checkForUpdate asks once, then answers from the cache for a day', async () => {
  const now = 1_700_000_000_000;
  const first = stub(json({ version: '1.2.3' }));
  const asked = await checkForUpdate({
    current: '1.0.0',
    fetcher: first.fetcher,
    now,
    disabled: false,
  });
  assert.deepEqual(asked.check, {
    current: '1.0.0',
    latest: '1.2.3',
    available: true,
    checkedAt: now,
  });
  assert.equal(asked.fetched, true);

  const again = stub(json({ version: '9.9.9' }));
  const cached = await checkForUpdate({
    current: '1.0.0',
    cached: { latest: '1.2.3', checkedAt: now },
    fetcher: again.fetcher,
    now: now + CHECK_TTL_MS - 1,
    disabled: false,
  });
  assert.equal(cached.check.latest, '1.2.3');
  assert.equal(cached.fetched, false);
  assert.equal(again.calls.length, 0, 'a fresh answer is not asked for again');

  const stale = stub(json({ version: '9.9.9' }));
  const refetched = await checkForUpdate({
    current: '1.0.0',
    cached: { latest: '1.2.3', checkedAt: now },
    fetcher: stale.fetcher,
    now: now + CHECK_TTL_MS + 1,
    disabled: false,
  });
  assert.equal(refetched.check.latest, '9.9.9');
  assert.equal(stale.calls.length, 1);
});

test('checkForUpdate is silent when it is off, or when the registry is not there', async () => {
  const off = stub(json({ version: '9.9.9' }));
  const disabled = await checkForUpdate({ current: '1.0.0', fetcher: off.fetcher, disabled: true });
  assert.deepEqual(disabled.check, {
    current: '1.0.0',
    latest: null,
    available: false,
    checkedAt: 0,
  });
  assert.equal(off.calls.length, 0, 'a check that is off does not ask');

  const offline = stub(new Error('offline'));
  const failed = await checkForUpdate({
    current: '1.0.0',
    fetcher: offline.fetcher,
    disabled: false,
  });
  assert.equal(failed.check.latest, null);
  assert.equal(failed.check.available, false);
  assert.equal(failed.fetched, true, 'it asked — the caller just has nothing to keep');

  // A failure is not cached: the next run asks again.
  const retry = stub(json({ version: '1.2.3' }));
  const next = await checkForUpdate({
    current: '1.0.0',
    cached: null,
    fetcher: retry.fetcher,
    disabled: false,
  });
  assert.equal(next.check.latest, '1.2.3');
});
