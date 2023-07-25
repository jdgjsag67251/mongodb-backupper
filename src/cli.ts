import { ArgumentParser } from 'argparse';

import createBackup from './index';

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

createBackup({
  uri,
  serializer,
  includeMetadata: meta,
  destinationPath: dest,
}).catch(console.error);
