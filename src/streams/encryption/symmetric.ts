import { DecipherGCM, createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'crypto';
import { PassThrough, Readable, promises as Stream } from 'stream';
import { promisify } from 'util';

import { IEventInstance, Options, OutputStreamHandler, TransformStreamResult, TransformType } from '../../types';

export default (
  password: string,
  outputHandler: OutputStreamHandler,
  streams: Options['transformStream']['beforeOutput'] = [],
  { iterations = 120_000 }: { iterations?: number } = {},
): Options['transformStream']['beforeOutput'] => {
  const writeFile = async (name: string, buffer: Buffer) => {
    const stream = new Readable();

    stream.push(buffer);
    stream.push(null);

    await Stream.pipeline([
      stream,
      await outputHandler.backup({ collectionName: name, fileExtension: 'raw', isMetaData: true }),
    ]);
  };

  const readFile = async (name: string) => {
    const stream = await outputHandler.restore.getCollection({
      collectionName: name,
      fileExtension: 'raw',
      isMetaData: true,
    });

    return new Promise<Buffer>((resolve, reject) => {
      let buffer = Buffer.alloc(0);

      stream.on('data', (chunk) => (buffer = Buffer.concat([buffer, chunk])));
      stream.once('error', (err) => reject(err));
      stream.once('end', () => resolve(buffer));
    });
  };

  type Details = { key: Buffer; authTags: Record<string, string> };

  const getKey = (salt: Buffer) => promisify(pbkdf2)(password, salt, iterations, 32, 'sha512');

  const getBackupDetails = async (eventInstance: IEventInstance): Promise<Details> => {
    const salt = randomBytes(32);
    const key = await getKey(salt);

    await writeFile('$crypto.salt', salt);

    const authTags: Record<string, string> = {};

    eventInstance.onEnd(async () => {
      await writeFile('$crypto.auth', Buffer.from(JSON.stringify(authTags))).catch((err) => {
        console.error(
          'Was unable to store the auth tags. This backup should be removed because it cannot be decrypted (by this tool).',
        );

        throw err;
      });
    });

    return { key, authTags };
  };

  const getRestoreDetails = async (): Promise<Details> => {
    const salt = await readFile('$crypto.salt');
    const key = await getKey(salt);

    const authTags = await readFile('$crypto.auth')
      .then((buffer) => JSON.parse(buffer.toString()))
      .catch(() => ({}));

    return { key, authTags };
  };

  const crypto = async (type: TransformType, eventInstance: IEventInstance): Promise<TransformStreamResult> => {
    const { key, authTags } = await (async () => {
      switch (type) {
        case 'backup':
          return getBackupDetails(eventInstance);
        case 'restore':
          return getRestoreDetails();
      }
    })();

    return {
      backup: async ({ collectionName, isMetaData }) => {
        const iv = randomBytes(12);
        const cipherStream = createCipheriv('aes-256-gcm', key, iv);

        const stream = new PassThrough({
          final(callback) {
            this.push(cipherStream.final());
            authTags[collectionName + (isMetaData ? '.$meta' : '')] = cipherStream.getAuthTag().toString('hex');
            callback();
          },
          transform(chunk, encoding, callback) {
            callback(null, cipherStream.update(chunk));
          },
        });

        stream.push(iv);

        return stream;
      },
      restore: async ({ collectionName, isMetaData }) => {
        const authTag = authTags[collectionName + (isMetaData ? '.$meta' : '')];
        if (!authTag) {
          throw new Error(`No auth tag found for '${collectionName}'`);
        }

        let decipherStream: DecipherGCM | undefined;
        const iv = Buffer.allocUnsafe(12);
        let ivBytesRead = 0;

        return new PassThrough({
          final(callback) {
            if (!decipherStream) {
              callback(new Error(`Stream too short. Required at least ${iv.length} bytes`));
            }

            try {
              this.push(decipherStream!.final());
              callback();
            } catch (err) {
              callback(err as Error);
            }
          },
          transform(chunk: Buffer, encoding, callback) {
            if (decipherStream) {
              callback(null, decipherStream.update(chunk));
            }

            const ivChunk = chunk.subarray(0, iv.length - ivBytesRead);
            ivChunk.copy(iv, ivBytesRead);
            ivBytesRead += ivChunk.length;

            if (ivBytesRead < iv.length) {
              callback();
              return;
            }

            decipherStream = createDecipheriv('aes-256-gcm', key, iv).setAuthTag(Buffer.from(authTag, 'hex'));
            callback(null, decipherStream.update(chunk.subarray(ivChunk.length)));
          },
        });
      },
    };
  };

  return [...streams, crypto];
};
