import profileAndUpload from './profilerService';
import { MINS_TO_MS_CONVERSION } from './constants';

const TIMEOUT = 5; // In minutes
const PROFILE_PROJECT = process.env.PROFILING_PROJECT || 'reside-test';

/**
 *
 */
async function runProfilerService(): Promise<any> {
  await profileAndUpload({ duration: TIMEOUT, project: PROFILE_PROJECT });

  setTimeout(() => {
    runProfilerService();
  }, TIMEOUT * MINS_TO_MS_CONVERSION);
}

console.log('Starting profiling service...');
runProfilerService();
