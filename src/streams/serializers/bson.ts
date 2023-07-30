import { BSON, BSONSerializeOptions } from 'mongodb';

import { SerializationStreamHandler } from '../../types';
import { ChunkStream } from '../../helpers';

export default (options?: BSONSerializeOptions): SerializationStreamHandler => {
  const deserialize = () => ChunkStream.createReader((buff) => BSON.deserialize(buff, options));
  const serialize = () => ChunkStream.createWriter((doc) => Buffer.from(BSON.serialize(doc, options)));

  return async () => ({
    fileExtension: 'bson',
    deserialize,
    serialize,
  });
};
