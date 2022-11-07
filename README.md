# What is FolderBsdp?
FolderBsdp is an algorithm which utilizes bsdp algorithm and file operations to provide diffing and patching capacities for two folders.
Bsdp is a famous algorithm which is open source, known as bsdiff. The name bsdp is the npm module name, as well as the combination between bsdiff and bspatch. Bsdp can diff two files but does not support diffing between folders. The name FolderBsdp contains the prefix Folder, which means that it diffs two folders. It keeps the API almost the same (input params are the same while returns promise instead).

# What does FolderBsdp do?
FolderBsdp compares two folders and provide the patch file (which is a zip actually). In the patch, it contains the resources to help modifying folder A's content to become folder B's content, including adding/removing directories and files, changing file content. In another word, the patch file stores the difference between two folders.
FolderBsdp uses file operation and bsdp algorithm. The motivation to come up with such an algorithm is that bsdp cannot diff two folders while diffing zip compress files is not optimal for reducing patch file size (compression algorithm enlarges the difference. If you are able to read Chinese, refer to https://mp.weixin.qq.com/s/qAuVQCMs7SJij3Nk0gw_bA (#^.^#)).

# How to use FolderBsdp?

This package supports ESM and CommonJS. We use ESM here as the example. 

## Install
```sh
npm install folderbsdp --save
```
## Use API
```typescript
import FolderBsdp from "FolderBsdp"
FolderBsdp.diff("./Users/myname/Documents/Afolder", "./Users/myname/Documents/Bfolder", "./Users/myname/Documents/ABdifference.patch")
FolderBsdp.patch("./Users/myname/Documents/Afolder", "./Users/myname/Documents/Bfolder", "./Users/myname/Documents/ABdifference.patch")
```

## Explanation of API
```typescript
FolderBsdp.diff("./Users/myname/Documents/Afolder", "./Users/myname/Documents/Bfolder", "./Users/myname/Documents/ABdifference.patch")
```

In the code above, it lists A folder's directory and B folder's directory as the resources, the patch result will be written to path "./Users/myname/Documents/" with file name "ABdifference.patch". Please make sure that "./Users/myname/Documents/ABdifference.patch" does not exist beforehand. Otherwise, the original file will be replaced. The patch file can use any suffix different from ".patch". The execution returns a promise, which carries no return value, but the resolve/reject signal is useful though :).

```typescript
FolderBsdp.patch("./Users/myname/Documents/Afolder", "./Users/myname/Documents/Bfolder", "./Users/myname/Documents/ABdifference.patch")
```

In the code above, both folder A and ABdifference.patch exist beforehand. "./Users/myname/Documents/Bfolder" should not exist beforehand, to which the patching result will be written. In another word, we use the original folder A resource and the difference patch to recover B. If directory "./Users/myname/Documents/Bfolder" exists before the patch method gets executed, it will be deleted when the execution starts. The execution returns a promise. The execution returns a promise, which carries no return value, but the resolve/reject signal is useful though :).