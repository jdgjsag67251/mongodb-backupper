# Compression

```ts
const backupper = await MongoDBBackupper.create(uri, fileOutput, {
  transformStream: {
    beforeOutput: [zlibCompression('brotli')],
  },
});
```
