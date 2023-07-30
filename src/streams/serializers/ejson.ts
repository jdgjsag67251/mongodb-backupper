import EJSON from 'ejson';

import { SerializationStreamHandler } from '../../types';
import { ChunkStream } from '../../helpers';

export default (options?: EJSON.StringifyOptions): SerializationStreamHandler => {
  const deserialize = () => ChunkStream.createReader((buff) => EJSON.parse(buff.toString()));
  const serialize = () => ChunkStream.createWriter((doc) => Buffer.from(EJSON.stringify(doc, options)));

  return async () => ({
    fileExtension: 'ejson',
    deserialize,
    serialize,
  });
};
