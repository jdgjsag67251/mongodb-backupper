import { BSON, Collection, Db, Document, MongoClient } from 'mongodb';
import { Transform, promises as Stream } from 'stream';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';

import type { MetadataHandler, Options, SerializerResult, StreamHandler } from './types';

export * from './types';

const collectionsToIgnore = [/^system\./, /^__/];

let log = console.log;

export const defaultOptions = Object.freeze<Omit<Options, 'uri' | 'destinationPath'>>({
  collections: undefined,
  includeMetadata: false,
  cleanDestination: true,
  options: undefined,
  serializer: 'bson',
  stream: undefined,
  logger: log,
  query: {},
});

const makeDirectory = async (path: string, { clean }: { clean?: boolean } = {}) => {
  try {
    const stats = await fs.stat(path);

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    if (clean) {
      await fs.rm(path, { force: true, recursive: true });
      await fs.mkdir(path);
    }

    return path;
  } catch (err) {
    if (isError(err) && err.code === 'ENOENT') {
      log(`Creating directory: ${path}`);
      return fs.mkdir(path);
    }

    throw err;
  }
};

const getCollectionsData = async (
  db: Db,
  handleMetadata: MetadataHandler,
  outputStream: StreamHandler,
  { query = {}, collections: allowedCollections }: Options,
) => {
  const collections = allowedCollections
    ? allowedCollections.map((collectionName) => db.collection(collectionName))
    : await db.collections();

  return Promise.allSettled(
    collections
      .filter((collection) => collectionsToIgnore.every((regex) => !regex.test(collection.collectionName)))
      .map(async (collection) => {
        log(`Processing '${collection.collectionName}'`);
        await handleMetadata(collection);

        const stream = collection.find(query).stream();

        await outputStream(collection.collectionName, stream);
        log(`Saved ${collection.collectionName}`);

        return collection.collectionName;
      }),
  );
};

export const toStream = (cb: (doc: Document) => Buffer | Promise<Buffer>) =>
  new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        Promise.resolve(cb(chunk))
          .then((result) => {
            callback(null, result);
          })
          .catch(callback);
      } catch (err) {
        callback(err as Error);
      }
    },
  });

const isError = (error: any): error is NodeJS.ErrnoException => error instanceof Error;

export default async (options: Options) => {
  log = options.logger ?? log;

  const serializer: SerializerResult = await (() => {
    if (typeof options.serializer === 'function') {
      return options.serializer();
    }

    const serializerOption = options.serializer?.toLowerCase();

    const serializerHelper =
      (serializer: (doc: Document) => Uint8Array | string): SerializerResult['getStream'] =>
      async () =>
        toStream((doc) => Buffer.from(serializer(doc)));

    const bsonSerializer: SerializerResult = {
      getStream: serializerHelper(BSON.serialize),
      fileExtension: 'bson',
    };
    const jsonSerializer: SerializerResult = {
      getStream: serializerHelper(JSON.stringify),
      fileExtension: 'json',
    };

    switch (serializerOption) {
      case 'bson':
        return bsonSerializer;
      case 'json':
        return jsonSerializer;
      default:
        throw new Error(`Invalid 'serializer' option (${serializerOption})`);
    }
  })();

  log('Backup starting...');

  const client = new MongoClient(options.uri, { maxPoolSize: 11, ...options.options });
  await client.connect();
  const db = client.db();

  log('Database opened');

  const outputPath = path.join(options.destinationPath, db.databaseName);
  const metadataPath = path.join(outputPath, '.metadata');

  await makeDirectory(outputPath, { clean: options.cleanDestination });

  if (options.includeMetadata !== false) {
    await makeDirectory(metadataPath);
  }

  const handleMetadata: MetadataHandler = async (collection: Collection) => {
    const indexes = await collection.indexes({
      full: true,
    });

    await fs.writeFile(path.join(metadataPath, `${collection.collectionName}.json`), JSON.stringify(indexes));
  };

  const handleCollection: StreamHandler = async (collectionName, dataStream) => {
    const filePath = path.join(outputPath, `${collectionName}.${serializer.fileExtension}`);

    const outputStream =
      options.stream?.({ outputPath, collectionName, filePath, fileExtension: serializer.fileExtension }) ??
      createWriteStream(filePath);

    await Stream.pipeline(dataStream, await serializer.getStream(collectionName), outputStream);
  };

  const results = await getCollectionsData(
    db,
    options.includeMetadata === true ? handleMetadata : () => Promise.resolve(),
    handleCollection,
    options,
  );

  log('-'.repeat(12));
  const { successful, errors } = results.reduce<{
    successful: PromiseFulfilledResult<string>[];
    errors: PromiseRejectedResult[];
  }>(
    (obj, result) => {
      if (result.status === 'fulfilled') {
        obj.successful.push(result);
      } else {
        obj.errors.push(result);
      }

      return obj;
    },
    { successful: [], errors: [] },
  );

  log('Successful:');
  successful.forEach((result) => {
    log(`\t${result.value}`);
  });
  if (errors.length > 0) {
    log('Errors:');
    errors.forEach((result) => {
      console.error(result.reason);
    });
  }

  await client.close();
  log('Database closed');
};
