import { ArgumentParser } from 'argparse';

import MongoDBBackupper, { bsonSerializer, fileOutput, jsonSerializer } from './index';

const parser = new ArgumentParser({ description: 'Backup MongoDB databases.' });

parser.add_argument('uri', { metavar: 'URI', type: String, help: 'The MongoDB connection URI' });
parser.add_argument('dest', { metavar: 'destination', type: String, help: 'The destination path' });
parser.add_argument('--serializer', {
  help: 'Select a serializer (bson or json)',
  type: String,
});
parser.add_argument('--meta', {
  help: 'Include metadata',
  type: Boolean,
});

const { uri, dest, serializer, meta } = parser.parse_args();

(async () => {
  const backupper = await MongoDBBackupper.create(uri, await fileOutput(dest, { clean: true }), {
    serializationStream: serializer === 'json' ? jsonSerializer() : bsonSerializer(),
    includeMetadata: meta,
    logger: console.log,
  });

  const log = backupper.options.logger;

  const results = await backupper.backup();

  log('-'.repeat(12));
  const { successful, errors } = results.reduce<{
    successful: PromiseFulfilledResult<string>[];
    errors: PromiseRejectedResult[];
  }>(
    (obj, result) => {
      if (result.status === 'fulfilled') {
        obj.successful.push(result);
      } else {
        obj.errors.push(result);
      }

      return obj;
    },
    { successful: [], errors: [] },
  );

  log('Successful:');
  successful.forEach((result) => {
    log(`\t${result.value}`);
  });
  if (errors.length > 0) {
    log('Errors:');
    errors.forEach((result) => {
      console.error(result.reason);
    });
  }
})().catch(console.error);
