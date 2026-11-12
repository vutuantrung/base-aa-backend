/** Allowed mock values for EServer VM capability announcements. */
export const SUPPORTING_FEATURES = Object.freeze([
  'Automation 1', 'Automation 2', 'Automation 3',
  'Parser', 'Login Cookie', 'Other'
]);
export const PARSER_TYPES = Object.freeze([
  'Post', 'Comment', 'Follower', 'Following', 'Profile'
]);
export const PLATFORMS = Object.freeze([
  'facebook', 'tiktok', 'threads', 'youtube'
]);

function sampleDistinct(values, minimum = 1, maximum = values.length, random = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const count = minimum + Math.floor(random() * (maximum - minimum + 1));
  return shuffled.slice(0, count);
}

/**
 * Create a mock VM list with the exact fields requested by AAUI.
 * The caller's authenticated EServer instanceId is used for stable mock IDs.
 * No source of real VM data is consulted.
 */
export function createMockVmInfo(instanceId, random = Math.random) {
  if (typeof instanceId !== 'string' || !instanceId.trim()) {
    throw new Error('instanceId is required');
  }
  return Array.from({ length: 2 }, (_, index) => ({
    id: `${instanceId}-vm-${index + 1}`,
    browserId: `${instanceId}-browser-${index + 1}`,
    version: '1.0.0',
    supportingPlatforms: sampleDistinct(PLATFORMS, 2, 3, random).map(platform => ({
      platform,
      supportingFeatures: sampleDistinct(SUPPORTING_FEATURES, 1, SUPPORTING_FEATURES.length, random),
      parserInfo: {
        version: '1.0.0',
        type: sampleDistinct(PARSER_TYPES, 1, PARSER_TYPES.length, random)
      }
    }))
  }));
}
