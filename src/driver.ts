import { Collection, Db, Document, IndexDescription, MongoClient } from 'mongodb';
import { promises as Stream, Readable, Writable } from 'stream';
import type { Stream as StreamType } from 'stream';

import type { Options, OutputDetails, OutputStreamHandler } from './types';

export * from './types';
export * from './streams';
export { toStreams } from './helpers';

type MetadataHandler = (collection: Collection) => Promise<void>;
type StreamHandler<S extends StreamType> = (collectionName: string, stream: S) => Promise<void>;
type GetOutputStream = StreamHandler<Readable & AsyncIterable<Document>>;
type WriteOutputStream = StreamHandler<Writable>;

const getCollectionsData = async (
  db: Db,
  handleMetadata: MetadataHandler,
  outputStream: GetOutputStream,
  { query = {}, collections: allowedCollections, logger, collectionNameMatchers }: Options,
) => {
  const collections = allowedCollections
    ? allowedCollections.map((collectionName) => db.collection(collectionName))
    : await db.collections();

  return Promise.allSettled(
    collections
      .filter((collection) => collectionNameMatchers.every((checker) => checker(collection.collectionName)))
      .map(async (collection) => {
        logger(`Processing '${collection.collectionName}'`);

        const stream = collection.find(query).stream();

        await Promise.all([await handleMetadata(collection), await outputStream(collection.collectionName, stream)]);

        logger(`Exported '${collection.collectionName}'`);

        return collection.collectionName;
      }),
  );
};

const writeCollectionsData = async (
  db: Db,
  collectionNames: string[],
  handleMetadata: MetadataHandler,
  outputStream: WriteOutputStream,
  { collections: allowedCollections, logger, collectionNameMatchers, restoreBatchSize }: Options,
) => {
  const filteredCollectionNames = allowedCollections
    ? collectionNames.filter((collectionName) => allowedCollections.includes(collectionName))
    : collectionNames;

  return Promise.allSettled(
    filteredCollectionNames
      .filter((collectionName) => collectionNameMatchers.every((checker) => checker(collectionName)))
      .map(async (collectionName) => {
        const collection = db.collection(collectionName);

        logger(`Processing '${collection.collectionName}'`);

        const stream = new Writable({
          objectMode: true,
          write(chunk, encoding, callback) {
            collection
              .insertOne(chunk)
              .then(() => callback())
              .catch((err) => callback(err));
          },
        });

        await Promise.all([await outputStream(collection.collectionName, stream), await handleMetadata(collection)]);

        logger(`Restored ${collection.collectionName}`);

        return collection.collectionName;
      }),
  );
};

export const backup = async (
  client: MongoClient,
  outputStreamHandler: OutputStreamHandler,
  options: Readonly<Options>,
): Promise<PromiseSettledResult<string>[]> => {
  const log = options.logger;

  log('Backup starting...');
  const db = client.db();
  log('Database opened');

  const [serializationStreamHandler, beforeSerializationHandler, afterSerializationHandler, beforeOutputHandler] =
    await Promise.all([
      options.serializationStream(),
      options.transformStream.beforeSerialization?.(),
      options.transformStream.afterSerialization?.(),
      options.transformStream.beforeOutput?.(),
    ]);

  const handlePipeline = async (inputStream: Readable, details: Omit<OutputDetails, 'fileExtension'>) => {
    const outputDetails = { ...details, fileExtension: serializationStreamHandler.fileExtension };

    return Stream.pipeline(
      [
        inputStream,
        await beforeSerializationHandler?.backup(outputDetails),
        await serializationStreamHandler.serialize(outputDetails),
        await afterSerializationHandler?.backup(outputDetails),
        await beforeOutputHandler?.backup(outputDetails),
        await outputStreamHandler.backup(outputDetails),
      ].filter((entry): entry is NonNullable<typeof entry> => !!entry),
    );
  };

  const handleMetadata: MetadataHandler = async (collection: Collection) =>
    handlePipeline(collection.listIndexes().stream(), {
      collectionName: collection.collectionName,
      isMetaData: true,
    });

  const handleCollection: GetOutputStream = async (collectionName, dataStream) =>
    handlePipeline(dataStream, { collectionName, isMetaData: false });

  const results = await getCollectionsData(
    db,
    options.includeMetadata === true ? handleMetadata : () => Promise.resolve(),
    handleCollection,
    options,
  );

  await client.close();
  log('Database closed');

  return results;
};

export const restore = async (
  client: MongoClient,
  outputStreamHandler: OutputStreamHandler,
  options: Readonly<Options>,
) => {
  const log = options.logger;

  log('Restore starting...');
  const db = client.db();
  log('Database opened');

  const [serializationStreamHandler, beforeSerializationHandler, afterSerializationHandler, beforeOutputHandler] =
    await Promise.all([
      options.serializationStream(),
      options.transformStream.beforeSerialization?.(),
      options.transformStream.afterSerialization?.(),
      options.transformStream.beforeOutput?.(),
    ]);

  const handlePipeline = async (outputStream: Writable, details: Omit<OutputDetails, 'fileExtension'>) => {
    const outputDetails = { ...details, fileExtension: serializationStreamHandler.fileExtension };

    return Stream.pipeline(
      [
        await outputStreamHandler.restore.getCollection(outputDetails),
        await afterSerializationHandler?.restore(outputDetails),
        await serializationStreamHandler.deserialize(outputDetails),
        await beforeSerializationHandler?.restore(outputDetails),
        await beforeOutputHandler?.restore(outputDetails),
        outputStream,
      ].filter((entry): entry is NonNullable<typeof entry> => !!entry),
    );
  };

  const handleMetadata: MetadataHandler = async (collection: Collection) => {
    const stream = new Writable({
      objectMode: true,
      write(chunk, encoding, callback) {
        collection
          .createIndexes([chunk])
          .then(() => callback())
          .catch((err) => callback(err));
      },
    });

    return handlePipeline(stream, { isMetaData: true, collectionName: collection.collectionName });
  };

  const handleCollection: WriteOutputStream = async (collectionName, dataStream) =>
    handlePipeline(dataStream, { collectionName, isMetaData: false });

  const results = await writeCollectionsData(
    db,
    await outputStreamHandler.restore.getCollectionNames(),
    options.includeMetadata === true ? handleMetadata : () => Promise.resolve(),
    handleCollection,
    options,
  );

  await client.close();
  log('Database closed');

  return results;
};
