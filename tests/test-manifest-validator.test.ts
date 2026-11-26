import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverTestFiles, loadAndValidateManifest, validateManifest } from '../scripts/test-manifest.mjs';

test('maintained manifest matches discovered backend and playground tests', () => {
  const manifest = loadAndValidateManifest();
  assert.equal(manifest.entries.length, 56);
  assert.equal(discoverTestFiles().length, 56);
});

test('validator rejects duplicate, missing, orphaned, malformed, and empty profile entries', () => {
  const validEntry = {
    path: 'tests/example.test.ts', runner: 'backend-node-test', responsibilityIds: ['M02'], layer: 'unit',
    requirements: { listener: false, nativeSQLite: false, filesystem: false, process: false, timeSensitive: false },
    profiles: ['fast', 'integration', 'full']
  };
  const baseline = { schemaVersion: 1, entries: [validEntry] };
  assert.deepEqual(validateManifest(baseline, [validEntry.path]), []);
  const invalid = { schemaVersion: 1, entries: [validEntry, { ...validEntry }, { ...validEntry, path: 'tests/orphan.test.ts', runner: 'jest', layer: 'bad', responsibilityIds: ['M99'], profiles: ['unknown'], requirements: { listener: 'yes' } }] };
  const errors = validateManifest(invalid, [validEntry.path, 'tests/unlisted.test.ts']);
  assert.ok(errors.some(error => error.includes('duplicate manifest path')));
  assert.ok(errors.some(error => error.includes('missing from manifest')));
  assert.ok(errors.some(error => error.includes('no discovered test')));
  assert.ok(errors.some(error => error.includes('invalid runner')));
  assert.ok(errors.some(error => error.includes('invalid layer')));
  assert.ok(errors.some(error => error.includes('responsibilityIds')));
  assert.ok(errors.some(error => error.includes('profiles')));
  assert.ok(errors.some(error => error.includes('requirements')));
});

test('newly discovered test absent from manifest fails closed', () => {
  const manifest = loadAndValidateManifest();
  assert.ok(validateManifest(manifest, [...discoverTestFiles(), 'tests/newly-added.test.ts']).some(error => error.includes('tests/newly-added.test.ts')));
});
