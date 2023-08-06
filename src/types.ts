import type { Document, Filter, MongoClientOptions } from 'mongodb';
import type { Writable, Transform, Readable } from 'stream';

export type OutputDetails = {
  collectionName: string;
  fileExtension: string;
  isMetaData: boolean;
};

export type SerializerResult = {
  deserialize: (details: OutputDetails) => Transform | Promise<Transform>;
  serialize: (details: OutputDetails) => Transform | Promise<Transform>;
  fileExtension: string;
};

export type SerializationStreamHandler = () => Promise<SerializerResult>;

export type OutputStreamHandler = {
  backup: (details: OutputDetails) => Promise<Writable>;
  restore: {
    getCollectionNames: () => string[] | Promise<string[]>;
    getCollection: (details: OutputDetails) => Readable | Promise<Readable>;
  };
};

export type TransformStreamResult = {
  restore: (details: OutputDetails) => Transform | Promise<Transform>;
  backup: (details: OutputDetails) => Transform | Promise<Transform>;
};

export type TransformType = 'backup' | 'restore';

export type EventInstanceHandle = Readonly<{
  id: string;
  remove: () => void;
}>;

export type EventInstanceCallback = () => void | Promise<void>;

export interface IEventInstance {
  /** Called after every collection has been handled */
  onEnd: (callback: EventInstanceCallback) => EventInstanceHandle;
}

export type Options = {
  /** Data serializer (default: `bsonSerializer`) */
  serializationStream: SerializationStreamHandler;
  // TODO: Have specific transform helpers with types.
  /** Transform the data at specific points */
  transformStream: {
    /**
     * Transform the documents before serialization\
     *  Every chunk is guaranteed to be a document\
     *  Accepts a document\
     *  Returns a document
     */
    beforeSerialization: ((type: TransformType, eventInstance: IEventInstance) => Promise<TransformStreamResult>)[];
    /**
     * Transform the documents before serialization\
     *  Every chunk is guaranteed to be a document\
     *  Accepts a serialized document\
     *  Returns a (modified) serialized document
     */
    afterSerialization: ((type: TransformType, eventInstance: IEventInstance) => Promise<TransformStreamResult>)[];
    /**
     * Transform the serialized stream before writing to the output stream\
     *  Chunks are NOT guaranteed to be a document\
     *  Accepts a buffer stream\
     *  Returns a buffer stream
     */
    beforeOutput: ((type: TransformType, eventInstance: IEventInstance) => Promise<TransformStreamResult>)[];
  };
  /** Collections to be exported */
  collections: string[] | undefined;
  // TODO: Add logging when a collection is ignored
  /** Array of matchers against collection names. If they return `false` the collection is ignored (default: `defaultCollectionNameMatchers`) */
  collectionNameMatchers: readonly ((collectionName: string) => boolean)[];
  /** Query that optionally limits the documents included */
  query: Filter<Document>;
  /** Save metadata of collections as indexes, ecc (default: `false`) */
  includeMetadata: boolean;
  /** MongoDB [options](https://www.mongodb.com/docs/manual/reference/connection-string) */
  options: MongoClientOptions;
  /** Logging function */
  logger: (str: string) => void;
  /** To reduce the load on the database, documents are inserted in batches. This allows you to configure the size of this batches */
  restoreBatchSize: number;
};
