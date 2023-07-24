# mongodb-backupper

## Example

```ts
import backup from 'mongodb-backupper';

backup({
  uri: 'mongodb://localhost:27017/db',
  destinationPath: './backup',
}).catch(console.error);
```
