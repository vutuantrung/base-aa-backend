const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getSelectionOptions, validateSelection } = require('../../shared/resource-selection.cjs');

test('mock records have the exact requested shapes and allowed platforms', () => {
  const data = getSelectionOptions();
  assert.ok(data.browserProfiles.length >= 2);
  assert.ok(data.proxies.length >= 2);
  assert.ok(data.platformAccounts.length >= 4);
  for (const record of data.browserProfiles) {
    assert.deepEqual(Object.keys(record).sort(), ['id','browserVersion','browserUserAgent'].sort());
  }
  for (const record of data.proxies) {
    assert.deepEqual(Object.keys(record).sort(), ['id','http','https'].sort());
  }
  for (const record of data.platformAccounts) {
    assert.deepEqual(Object.keys(record).sort(), ['accountId','platform'].sort());
    assert.ok(['facebook','tiktok','threads','youtube'].includes(record.platform));
  }
});

test('submission contains precisely one ID from each group and no other fields', () => {
  const data = getSelectionOptions();
  const selected = {
    browserProfileId: data.browserProfiles[1].id,
    proxyId: data.proxies[0].id,
    accountId: data.platformAccounts[2].accountId
  };
  assert.deepEqual(validateSelection(selected), { ok: true, data: selected });
  assert.equal(Object.keys(validateSelection(selected).data).length, 3);
});

test('missing, multiple, unknown and malformed selections are rejected', () => {
  const data = getSelectionOptions();
  const selected = {
    browserProfileId: data.browserProfiles[0].id,
    proxyId: data.proxies[0].id,
    accountId: data.platformAccounts[0].accountId
  };
  assert.equal(validateSelection({ ...selected, proxyId: '' }).ok, false);
  assert.equal(validateSelection({ ...selected, anotherProxyId: data.proxies[1].id }).ok, false);
  assert.equal(validateSelection({ ...selected, accountId: 'unknown-account' }).ok, false);
  assert.equal(validateSelection({ ...selected, browserProfileId: ['a','b'] }).ok, false);
  assert.equal(validateSelection(null).ok, false);
});
