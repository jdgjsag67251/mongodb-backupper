import { promises as fs } from 'fs';
import { Document } from 'mongodb';
import { Transform } from 'stream';

import { SerializerResult } from './types';

export class PrivateConstructor {
  static #isInternalConstructing = false;

  constructor() {
    if (!PrivateConstructor.#isInternalConstructing) {
      throw new TypeError(
        `${this.constructor.name} cannot be created with the \`new\` keyword. Use \`${this.constructor.name}.create\` instead`,
      );
    }
    PrivateConstructor.#isInternalConstructing = false;
  }

  protected static handleCreate<T extends new (...args: any) => any>(classConstructor: T) {
    PrivateConstructor.#isInternalConstructing = true;

    return (...args: ConstructorParameters<T>): T =>
      // @ts-expect-error: Should work
      new classConstructor(...args);
  }
}

export const toStreams = ({
  serialize,
  deserialize,
}: {
  serialize: (doc: Document) => Buffer | Promise<Buffer>;
  deserialize: (buff: Buffer) => Document | Promise<Document>;
}): Pick<SerializerResult, 'serialize' | 'deserialize'> => {
  const createStream = (cb: (data: any) => any) => async () => {
    const transformStream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          Promise.resolve(cb(chunk))
            .then((result) => callback(null, result))
            .catch(callback);
        } catch (err) {
          callback(err as Error);
        }
      },
    });

    return transformStream;
  };

  return {
    deserialize: createStream(deserialize),
    serialize: createStream(serialize),
  };
};

export const isError = (error: any): error is NodeJS.ErrnoException => error instanceof Error;

export const makeDirectory = async (
  path: string,
  { clean }: { clean?: boolean } = {},
): Promise<{ created: boolean; path: string }> => {
  try {
    const stats = await fs.stat(path);

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${path}`);
    }

    if (clean) {
      await fs.rm(path, { force: true, recursive: true });
      await fs.mkdir(path);
    }

    return { created: false, path };
  } catch (err) {
    if (isError(err) && err.code === 'ENOENT') {
      await fs.mkdir(path);
      return { created: true, path };
    }

    throw err;
  }
};

/**
 * @description This stream preserves chunk boundaries.
 *  This means that for every chunk written, it is guaranteed you will get the same chunk out.
 */
export class ChunkStream {
  static createWriter(transformer: (chunk: Buffer) => Buffer | Promise<Buffer> = (chunk) => chunk): Transform {
    const newLineByte = '\n'.charCodeAt(0);

    const encode = (buffer: Buffer): Buffer => {
      const bytes: number[] = [];

      buffer.forEach((byte) => {
        bytes.push(byte);
        if (byte === newLineByte) {
          bytes.push(newLineByte);
        }
      });

      return Buffer.from(bytes);
    };

    return new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        Promise.resolve(transformer(chunk))
          .then((result) => callback(null, Buffer.concat([encode(result), Buffer.from('\n')])))
          .catch(callback);
      },
    });
  }

  static createReader(
    transformer: (chunk: Buffer) => Buffer | Document | Promise<Buffer | Document> = (chunk) => chunk,
  ): Transform {
    const newLineByte = '\n'.charCodeAt(0);
    const emptyBuffer = Buffer.alloc(0);
    let buffer: Buffer = emptyBuffer;

    const decode = (buffer: Buffer) => {
      const unescaped: number[] = [];

      buffer.forEach((byte, index) => {
        if (buffer[index - 1] !== newLineByte) {
          unescaped.push(byte);
        }
      });

      return transformer(Buffer.from(unescaped));
    };

    const transform = new Transform({
      objectMode: true,
      flush(callback) {
        if (buffer.length > 0) {
          this.push(decode(buffer));
        }

        callback();
      },
      transform(partialChunk, encoding, callback) {
        const chunk = Buffer.concat([buffer, partialChunk]);

        let start = 0;
        for (let i = 0; i < chunk.length; i++) {
          const nextByte = chunk[i + 1];
          const byte = chunk[i];

          if (byte === newLineByte && nextByte === newLineByte) {
            i++;
            continue;
          }

          if (byte === newLineByte) {
            buffer = emptyBuffer;
            this.push(decode(chunk.subarray(start, i)));
            start = i + 1;
          }
        }

        const remaining = chunk.subarray(start);
        buffer = Buffer.concat([buffer, remaining]);

        callback();
      },
    });

    return transform;
  }
}
