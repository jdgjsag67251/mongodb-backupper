import { createReadStream, createWriteStream, promises as fs } from 'fs';
import path from 'path';

import { OutputDetails, OutputStreamHandler } from '../../types';
import { makeDirectory } from '../../helpers';

export default async (
  outputPath: string,
  { clean = false }: { clean?: boolean } = {},
): Promise<OutputStreamHandler> => {
  const metadataPath = path.join(outputPath, 'metadata');

  const getFileName = ({ collectionName, fileExtension, isMetaData }: OutputDetails) => {
    const fileName = `${collectionName}.${fileExtension}`;

    return isMetaData ? path.join(metadataPath, fileName) : path.join(outputPath, fileName);
  };

  let hasCleanedDirectory = false;
  const backup: OutputStreamHandler['backup'] = async (details) => {
    if (!hasCleanedDirectory) {
      hasCleanedDirectory = true;
      await Promise.all([await makeDirectory(outputPath, { clean }), await makeDirectory(metadataPath, { clean })]);
    }

    return createWriteStream(getFileName(details));
  };

  const restore: OutputStreamHandler['restore'] = {
    getCollection: async (details) => createReadStream(getFileName(details)),
    getCollectionNames: async () => {
      const dirEntry = await fs.readdir(outputPath, { withFileTypes: true });

      return dirEntry.filter((entry) => entry.isFile()).map((entry) => path.parse(entry.name).name);
    },
  };

  return {
    restore,
    backup,
  };
};
