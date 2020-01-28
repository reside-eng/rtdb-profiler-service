import { Writable } from 'stream';
import { spawn } from 'child_process';

/**
 * Async await wrapper for easy error handling
 * @param promise - Promise to wrap responses of in array
 * @param errorExt - Extension for error
 * @returns Resolves and rejects with an array
 */
export function to<T, U = Error>(
  promise: Promise<T>,
  errorExt?: object,
): Promise<[U | null, T | undefined]> {
  return promise
    .then<[null, T]>((data: T) => [null, data])
    .catch<[U, undefined]>((err: U) => {
      if (errorExt) {
        Object.assign(err, errorExt);
      }

      return [err, undefined];
    });
}

export interface RunCommandOptions {
  command: string;
  args: string[];
  pipeOutput?: boolean;
}

/**
 * Run a bash command using spawn pipeing the results to the main process
 * @param runOptions - Options for command run
 * @param runOptions.command - Command to be executed
 * @param runOptions.args - Command arguments
 * @returns Resolves with results of running the command
 * @private
 */
export function runCommand(runOptions: RunCommandOptions): Promise<any> {
  const { command, args, pipeOutput = true } = runOptions;
  return new Promise((resolve, reject): void => {
    const child = spawn(command, args, { shell: true });
    let output: any;
    let error: any;
    const customStream = new Writable();
    const customErrorStream = new Writable();
    /* eslint-disable no-underscore-dangle */
    customStream._write = (data, ...argv): void => {
      output += data;
      if (pipeOutput) {
        process.stdout._write(data, ...argv);
      }
    };
    customErrorStream._write = (data, ...argv): void => {
      error += data;
      if (pipeOutput) {
        process.stderr._write(data, ...argv);
      }
    };
    /* eslint-enable no-underscore-dangle */
    // Pipe errors and console output to main process
    child.stdout.pipe(customStream);
    child.stderr.pipe(customErrorStream);
    // When child exits resolve or reject based on code
    child.on('exit', (code: number): void => {
      if (code !== 0) {
        reject(error || output);
      } else {
        resolve(output);
      }
    });
  });
}
