/** Internal lifecycle seams for deterministic tests; not re-exported from the app API. */
export { rollbackAfterStartupFailure as testRollbackAfterStartupFailure,
  closeFailedStartup as testCloseFailedStartup,
  startApplicationResources as testStartApplicationResources } from './create-app.js';
