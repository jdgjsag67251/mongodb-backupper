import type { Collection, Document, Filter, MongoClientOptions } from 'mongodb';
import type { Readable, Writable, Transform } from 'stream';

export type Stream = Readable & AsyncIterable<Document>;
export type StreamHandler = (collectionName: string, stream: Stream) => Promise<void>;
export type SerializerResult = {
  getStream: (collectionName: string) => Promise<Transform>;
  fileExtension: string;
};
export type MetadataHandler = (collection: Collection) => Promise<void>;

export type Options = {
  /** URI for MongoDB connection */
  uri: string;
  /** Path where to save the data to */
  destinationPath: string;
  /** Data serializer (bson, json) or custom (default: bson) */
  serializer?: 'bson' | 'json' | (() => Promise<SerializerResult>);
  /** Collections to be exported */
  collections?: string[];
  /** Custom write stream */
  stream?: (details: {
    outputPath: string;
    collectionName: string;
    filePath: string;
    fileExtension: string;
  }) => Writable;
  /** Query that optionally limits the documents included */
  query?: Filter<Document>;
  /** Save metadata of collections as Index, ecc */
  includeMetadata?: boolean;
  /** MongoDB [options](https://www.mongodb.com/docs/manual/reference/connection-string) */
  options?: MongoClientOptions;
  /** Remove existing files from the destination directory */
  cleanDestination?: boolean;
  /** Logging function */
  logger?: (str: string) => void;
};
