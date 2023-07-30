import { MongoClient } from 'mongodb';
import merge from 'lodash.merge';

import { Options, OutputStreamHandler } from './types';
import { PrivateConstructor } from './helpers';
import { backup, restore } from './driver';
import * as streams from './streams';

export * from './driver';

export const defaultCollectionNameMatchers = Object.freeze<Options['collectionNameMatchers']>(
  [/^system\./, /^__/].map((regex) => (name: string) => !regex.test(name)),
);

export const defaultOptions = Object.freeze<Options>({
  collectionNameMatchers: defaultCollectionNameMatchers,
  serializationStream: streams.bsonSerializer(),
  collections: undefined,
  includeMetadata: false,
  restoreBatchSize: 12,
  transformStream: {},
  logger: () => {},
  query: {},
  options: {
    maxPoolSize: 11,
  },
});

export default class MongoDBBackupper extends PrivateConstructor {
  #outputStreamHandler: OutputStreamHandler;
  #client: MongoClient;
  #options: Options;

  get options(): Readonly<Options> {
    return { ...this.#options };
  }

  private constructor(client: MongoClient, outputStreamHandler: OutputStreamHandler, options: Options) {
    super();

    this.#outputStreamHandler = outputStreamHandler;
    this.#options = options;
    this.#client = client;
  }

  async backup() {
    return backup(this.#client, this.#outputStreamHandler, this.#options);
  }

  async restore() {
    return restore(this.#client, this.#outputStreamHandler, this.#options);
  }

  static async create(
    /** URI for MongoDB connection */
    uri: string,
    /** Handler for the final output stream */
    outputStreamHandler: OutputStreamHandler,
    /** General options */
    options?: Partial<Options>,
  ): Promise<MongoDBBackupper> {
    const formattedOptions = MongoDBBackupper.formatOptions(options);

    const client = new MongoClient(uri, formattedOptions.options);
    await client.connect();

    // @ts-expect-error
    return super.handleCreate(MongoDBBackupper)(client, outputStreamHandler, formattedOptions);
  }

  private static formatOptions(options: Partial<Options> | undefined): Options {
    const mergedOptions: Options = merge({}, defaultOptions, options ?? {});

    if (
      !Array.isArray(mergedOptions.collectionNameMatchers) ||
      mergedOptions.collectionNameMatchers.some((entry) => typeof entry !== 'function')
    ) {
      throw new Error('Invalid `collectionNameMatchers` option');
    }

    if (
      mergedOptions.collections &&
      (!Array.isArray(mergedOptions.collections) ||
        mergedOptions.collections.some((entry) => typeof entry !== 'string'))
    ) {
      throw new Error('Invalid `collections` option');
    }

    if (typeof mergedOptions.logger !== 'function') {
      throw new Error('Invalid `logger` option');
    }

    mergedOptions.includeMetadata = !!mergedOptions.includeMetadata;

    return mergedOptions;
  }
}
