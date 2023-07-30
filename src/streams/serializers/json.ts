import { SerializationStreamHandler } from '../../types';
import { ChunkStream } from '../../helpers';

export default (options?: { spacer?: string }): SerializationStreamHandler => {
  const deserialize = () => ChunkStream.createReader((buff) => JSON.parse(buff.toString()));
  const serialize = () =>
    ChunkStream.createWriter((doc) => Buffer.from(JSON.stringify(doc, undefined, options?.spacer)));

  return async () => ({
    fileExtension: 'json',
    deserialize,
    serialize,
  });
};
