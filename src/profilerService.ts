import * as admin from 'firebase-admin';
import { readFile, mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import { dirname } from 'path';
import { format } from 'date-fns';
import { Logging } from '@google-cloud/logging';
import { runCommand, to } from './utils';
import { MINS_TO_S_CONVERSION } from './constants';

// Creates a client
const logging = new Logging();

const readFilePromise = promisify(readFile);

/**
 * @param outputPath - File path for results
 * @param projectName - Name of Google Cloud Project
 * @param profileDuration - Duration for profiling
 */
async function profileDatabase(
  outputPath: string,
  projectName?: string,
  profileDuration?: any,
): Promise<any> {
  const duration = profileDuration * MINS_TO_S_CONVERSION || '30'; // in seconds
  const outFolder = dirname(outputPath);
  try {
    // Create folder for file path
    if (!existsSync(outFolder)) {
      mkdirSync(outFolder);
    }

    // Create file if it doesn't exist (fix issue with firebase-tools not finding file)
    if (!existsSync(outputPath)) {
      writeFileSync(outputPath, '');
    }
  } catch (err) {
    console.log(`Error making folder for path:"${outputPath}":`, err);
    throw err;
  }

  const commandArgs: string[] = [
    'database:profile',
    '--raw',
    '-o',
    outputPath,
    '--project',
    projectName || '',
    '-d',
    duration?.toString() || '30',
  ];
  console.log('Running command with args:', commandArgs);

  if (process.env.FIREBASE_TOKEN) {
    commandArgs.push('--token', process.env.FIREBASE_TOKEN);
  } else {
    console.warn(
      'NOTE: Running without FIREBASE_TOKEN can cause authentication issues',
    );
  }

  try {
    // Call database profiler
    const results = await runCommand({
      command: 'npx firebase',
      args: commandArgs,
    });
    return results;
  } catch (err) {
    console.error('Error running firebase command with args:', commandArgs);
    throw err;
  }
}

/**
 * @param resultsPath - Path of results file
 */
async function parseResults(resultsPath: string): Promise<any[]> {
  console.log('Starting profiler results parse...');
  const [readFileErr, resultsFileContents] = await to(
    readFilePromise(resultsPath),
  );

  // Handle errors reading file
  if (readFileErr) {
    console.error(`Error reading file from path ${resultsPath}`);
    throw readFileErr;
  }

  // Handle empty file
  if (!resultsFileContents) {
    throw new Error(`${resultsPath} does not contain any content to parse`);
  }

  // Split results string by newlines (how JSON is output by firebase-tools when using --raw)
  const resultsStringsByLine = resultsFileContents.toString().split('\n');
  console.log(
    `Parsing ${resultsStringsByLine.length} lines from results file...`,
    resultsStringsByLine,
  );

  // Split results into different lines and parse into JSON
  const parsedLines = resultsStringsByLine.map((resultLineStr, lineIdx) => {
    try {
      return JSON.parse(resultLineStr);
    } catch (err) {
      console.error(
        `Error parsing line ${lineIdx}/${resultsStringsByLine.length}`,
        resultLineStr,
      );
      return resultLineStr;
    }
  });

  // Remove falsey values (i.e. blank lines)
  return parsedLines.filter(Boolean);
}

/**
 *
 */
async function getServiceAccount(): Promise<any> {
  // Load from environment variable
  if (process.env.SERVICE_ACCOUNT) {
    console.log('Loading service account from environment variable');
    try {
      return JSON.parse(process.env.SERVICE_ACCOUNT);
    } catch (err) {
      console.error('Error parsing SERVICE_ACCOUNT env variable:', err);
      throw err;
    }
  }

  // Load from local file
  const serviceAccountPath = './serviceAccount.json';
  if (existsSync(serviceAccountPath)) {
    console.log('Loading service account from local file');
    const saStr = await readFilePromise(serviceAccountPath);
    try {
      return JSON.parse(saStr.toString());
    } catch (err) {
      console.log('Error parsing SERVICE_ACCOUNT file');
      throw err;
    }
  }
  const serviceSccountErr = 'Service Account not found';
  console.error(serviceSccountErr);
  throw new Error(serviceSccountErr);
}

interface UploadSettings {
  project?: string;
  bucketName?: string;
}
/**
 * @param cloudStorageFilePath - Path to file in cloud storage
 * @param resultsToUpload - JSON results to upload
 * @param settings - Settings for upload
 */
async function uploadResults(
  cloudStorageFilePath: string,
  resultsToUpload: string[],
  settings?: UploadSettings,
): Promise<any> {
  console.log(
    `Writing profiler results cloud storage path: ${cloudStorageFilePath}...`,
  );
  // Load service account from environment variable falling back to local file
  const sa = await getServiceAccount();
  const credential =
    admin.credential.cert(sa) || admin.credential.applicationDefault();
  const projectId =
    settings?.project ||
    sa?.project_id ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  const bucketName =
    (settings && settings.bucketName) || `${projectId}.appspot.com`;

  admin.initializeApp({
    credential,
    databaseURL: `https://${projectId}.firebaseio.com`,
  });

  try {
    const stringifiedResults = JSON.stringify(resultsToUpload, null, 2);
    const results = await admin
      .storage()
      .bucket(bucketName)
      .file(cloudStorageFilePath)
      .save(stringifiedResults);
    console.log(
      `Successfully uploaded to ${bucketName}/${cloudStorageFilePath}`,
    );
    return results;
  } catch (err) {
    console.error(`Error uploading ${cloudStorageFilePath}: `, err);
    throw err;
  }
}

interface ProfileAndUploadOptions {
  /* Time to run profiler */
  duration: number;
  project: string;
}

/**
 * @param options - Options for profiling and uploading
 */
export default async function profileAndUpload(
  options?: ProfileAndUploadOptions,
): Promise<any> {
  console.log('Called profile and upload', options);
  const now = new Date();
  const currentDateStamp = format(now, 'MM-dd-yyyy');
  const currentTimeStamp = format(now, 'H:mm:ss.SSS');
  const localFilePath = `./${currentTimeStamp}.json`;

  // Run database profiler
  await profileDatabase(localFilePath, options?.project, options?.duration);

  // Parse results from file into JSON
  const parsedResults = await parseResults(localFilePath);

  // Remove local file
  unlinkSync(localFilePath);

  // Write results to Stackdriver
  const log = logging.log('my-log');
  // Create array of log entries
  const stackdriverEntries: any[] = [];
  parsedResults.forEach(parsedLine => {
    const resource = {
      // This example targets the "global" resource for simplicity
      type: 'global',
    };
    stackdriverEntries.push(log.entry({ resource }, parsedLine));
  });
  // Write log entries all at once
  await log.write(stackdriverEntries);

  // Write profiler results to Cloud Storage
  const cloudStorageFilePath = `profiler-service-results/${currentDateStamp}/${currentTimeStamp}.json`;
  await uploadResults(cloudStorageFilePath, parsedResults, {
    project: options?.project,
  });
}
