import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = join(root, 'docs/testing/R7_7_TEST_MANIFEST.json');
const responsibilityIds = new Set([...Array.from({ length: 18 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`), 'SG02', 'unknown']);
const layers = new Set(['unit', 'contract', 'integration', 'process', 'playground', 'mixed', 'architecture']);
const runners = new Set(['backend-node-test', 'playground-node-test']);
const profiles = new Set(['fast', 'integration', 'full']);
const requirementKeys = ['listener', 'nativeSQLite', 'filesystem', 'process', 'timeSensitive'];

function matchingFiles(directory, pattern) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .filter(entry => entry.isFile() && pattern.test(entry.name))
    .map(entry => `${directory}/${entry.name}`);
}

export function discoverTestFiles() {
  // These locations mirror the existing root and playground npm test globs.
  return [
    ...matchingFiles('tests', /\.test\.ts$/),
    ...matchingFiles('testing/tests', /\.test\.mjs$/),
    ...matchingFiles('testing/aa/tests', /\.test\.cjs$/)
  ].sort();
}

export function validateManifest(manifest, discoveredFiles) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) return ['manifest must have schemaVersion 1 and an entries array'];
  const seen = new Set();
  const paths = new Set(manifest.entries.map(entry => entry?.path));
  for (const file of discoveredFiles) if (!paths.has(file)) errors.push(`discovered test is missing from manifest: ${file}`);
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.path !== 'string') { errors.push('entry path must be a string'); continue; }
    if (seen.has(entry.path)) errors.push(`duplicate manifest path: ${entry.path}`);
    seen.add(entry.path);
    if (!discoveredFiles.includes(entry.path)) errors.push(`manifest entry has no discovered test: ${entry.path}`);
    if (!runners.has(entry.runner)) errors.push(`${entry.path}: invalid runner ${entry.runner}`);
    if (!layers.has(entry.layer)) errors.push(`${entry.path}: invalid layer ${entry.layer}`);
    if (!Array.isArray(entry.responsibilityIds) || entry.responsibilityIds.length === 0 || entry.responsibilityIds.some(id => !responsibilityIds.has(id))) errors.push(`${entry.path}: invalid or empty responsibilityIds`);
    if (!Array.isArray(entry.profiles) || entry.profiles.length === 0 || entry.profiles.some(profile => !profiles.has(profile))) errors.push(`${entry.path}: invalid or empty profiles`);
    if (!entry.requirements || requirementKeys.some(key => typeof entry.requirements[key] !== 'boolean')) errors.push(`${entry.path}: requirements must define boolean ${requirementKeys.join(', ')}`);
    if (entry.profiles?.includes('fast') && (entry.requirements?.listener || entry.requirements?.nativeSQLite || entry.requirements?.process)) errors.push(`${entry.path}: fast profile requires listener/native SQLite/process`);
  }
  for (const profile of profiles) if (!manifest.entries.some(entry => entry?.profiles?.includes(profile))) errors.push(`required profile has no manifest tests: ${profile}`);
  return errors;
}

export function loadAndValidateManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const errors = validateManifest(manifest, discoverTestFiles());
  if (errors.length) throw new Error(`Test manifest validation failed:\n${errors.map(error => `- ${error}`).join('\n')}`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = loadAndValidateManifest();
  const counts = Object.fromEntries([...profiles].map(profile => [profile, manifest.entries.filter(entry => entry.profiles.includes(profile)).length]));
  console.log(`Validated ${manifest.entries.length} manifest entries against ${discoverTestFiles().length} discovered tests; profiles ${JSON.stringify(counts)}`);
}
