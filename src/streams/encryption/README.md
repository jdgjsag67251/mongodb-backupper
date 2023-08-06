# Encryption

```ts
const backupper = await MongoDBBackupper.create(uri, fileOutput, {
  transformStream: {
    // Note that `encryption` returns its own array instead of a stream.
    //	This is to ensure that encryption will always happen last.
    //
    // In the case below, we want to compress before encrypting,
    //	because compressing encrypted data does not really do very much.
    beforeOutput: encryption(password, fileOutput, [zlibCompression('brotli')]),
  },
});
```
