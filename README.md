# mongodb-backupper

This package is similar to `mongodump` but as an extensible library, which allows for more flexibility.

## Example

```ts
import MongoDBBackupper, { bsonSerializer, fileBackup } from 'mongodb-backupper';

const backupper = new MongoDBBackupper('mongodb://localhost:27017/db', await fileBackup('./backup', { clean: true }), {
  collections: ['users'],
  // Just an example, no need to specify this since this is the default value
  serializerStream: bsonSerializer({ checkKeys: false }),
});

const results = await backupper.backup();

await backupper.restore();
```
