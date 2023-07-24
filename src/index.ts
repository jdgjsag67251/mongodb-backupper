import fs from 'fs/promises';
import path from 'path';

import driver, { Options, defaultOptions } from './driver';

/**
 * Determines if the provided path is a directory
 *
 * @param path
 */
const checkDirectory = async (path: string): Promise<{ exists: boolean; isDirectory: boolean }> => {
  try {
    await fs.access(path, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    return { exists: false, isDirectory: false };
  }

  const stats = await fs.stat(path);

  return { exists: true, isDirectory: stats.isDirectory() };
};

export default async function backup(options: Options) {
  const optionsWithDefaults = { ...defaultOptions, ...options };

  if (!optionsWithDefaults.uri || typeof optionsWithDefaults.uri !== 'string') {
    throw new Error('Missing `uri` option');
  }

  if (!optionsWithDefaults.stream) {
    if (!optionsWithDefaults.destinationPath) {
      throw new Error('Missing `destinationPath` option');
    }

    const { exists, isDirectory } = await checkDirectory(optionsWithDefaults.destinationPath);

    if (!exists) {
      await fs.mkdir(optionsWithDefaults.destinationPath, { recursive: true });
    } else if (!isDirectory) {
      throw new Error('`destinationPath` option is not a directory');
    }
  }

  const formattedOptions: Options = {
    ...optionsWithDefaults,
    destinationPath: path.resolve(String(optionsWithDefaults.destinationPath || '')),
    collections: Array.isArray(optionsWithDefaults.collections) ? optionsWithDefaults.collections : undefined,
    query: typeof optionsWithDefaults.query === 'object' ? optionsWithDefaults.query : {},
    options: typeof optionsWithDefaults.options === 'object' ? optionsWithDefaults.options : {},
    includeMetadata: !!optionsWithDefaults.includeMetadata,
  };

  return driver(formattedOptions);
}
