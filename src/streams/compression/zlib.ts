import {
  BrotliOptions,
  ZlibOptions,
  createBrotliCompress,
  createBrotliDecompress,
  createDeflate,
  createGunzip,
  createGzip,
  createInflate,
} from 'zlib';

import { TransformStreamResult } from '../../types';

export default (algorithm: 'brotli' | 'gzip' | 'deflate', options?: BrotliOptions | ZlibOptions) => {
  const [compress, decompress] = (() => {
    switch (algorithm.toLowerCase()) {
      case 'brotli':
        return [createBrotliCompress, createBrotliDecompress];
      case 'deflate':
        return [createDeflate, createInflate];
      case 'gzip':
        return [createGzip, createGunzip];
      default:
        throw new Error(`Invalid algorithm '${algorithm}'`);
    }
  })();

  return async (): Promise<TransformStreamResult> => ({
    restore: () => decompress(options),
    backup: () => compress(options),
  });
};
