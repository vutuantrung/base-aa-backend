'use strict';

/** Local demonstration catalog; selections transmit identifiers only. */
const browserProfiles = Object.freeze([
  { id: 'browser-profile-001', browserVersion: 'Chrome 154.0', browserUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0 Safari/537.36' },
  { id: 'browser-profile-002', browserVersion: 'Chrome 153.0', browserUserAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36' },
  { id: 'browser-profile-003', browserVersion: 'Firefox 145.0', browserUserAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0' }
]);
const proxies = Object.freeze([
  { id: 'proxy-001', http: 'http://127.0.0.1:8080', https: 'http://127.0.0.1:8443' },
  { id: 'proxy-002', http: 'http://127.0.0.1:8081', https: 'http://127.0.0.1:8444' },
  { id: 'proxy-003', http: 'http://127.0.0.1:8082', https: 'http://127.0.0.1:8445' }
]);
const platformAccounts = Object.freeze([
  { accountId: 'account-fb-001', platform: 'facebook' },
  { accountId: 'account-tk-001', platform: 'tiktok' },
  { accountId: 'account-th-001', platform: 'threads' },
  { accountId: 'account-yt-001', platform: 'youtube' }
]);

const fields = ['browserProfileId', 'proxyId', 'accountId'];
function validateSelection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length ||
      !fields.every(key => typeof value[key] === 'string' && value[key].trim().length > 0 && value[key].length <= 150)) {
    return { ok: false, error: 'Exactly one browserProfileId, proxyId and accountId is required' };
  }
  // Server enforces known records instead of accepting arbitrary identifiers.
  if (!browserProfiles.some(record => record.id === value.browserProfileId) ||
      !proxies.some(record => record.id === value.proxyId) ||
      !platformAccounts.some(record => record.accountId === value.accountId)) {
    return { ok: false, error: 'Selection contains an unknown record identifier' };
  }
  return { ok: true, data: {
    browserProfileId: value.browserProfileId,
    proxyId: value.proxyId,
    accountId: value.accountId
  } };
}

function getSelectionOptions() {
  return {
    browserProfiles: browserProfiles.map(record => ({ ...record })),
    proxies: proxies.map(record => ({ ...record })),
    platformAccounts: platformAccounts.map(record => ({ ...record }))
  };
}

module.exports = { getSelectionOptions, validateSelection };
