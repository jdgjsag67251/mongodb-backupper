# mongodb-backupper

## Example

```ts
import createBackup from 'mongodb-backupper';

createBackup({
  uri: 'mongodb://localhost:27017/db',
  destinationPath: './backup',
}).catch(console.error);
```
