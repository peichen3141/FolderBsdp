// @ts-ignore
import walker from "walker";
import path from "path";
import fs from "fs-extra";
import crypto from "crypto";
// @ts-ignore
import bsdp from "bsdp";
import archiver from "archiver";

const OPERATION_ACTION = {
  ADD_DIR: "add_dir",
  ADD_FILE: "add_file",
  DELETE_FILE: "delete_file",
  MODIFY_FILE: "modify_file",
  DELETE_DIR: "delete_dir",
};

const FOLDER_BSDP_VERSION = 1;

function getRelativePaths(parentDir: string) {
  return new Promise<{ files: string[]; dirs: string[] }>((resolve, reject) => {
    const files = [] as string[];
    const dirs = [] as string[];
    walker(parentDir)
      .on("dir", function (dir: string, _stat: string) {
        const rpath = path.relative(parentDir, dir);
        if (rpath.length === 0) {
          // do not add parent dir as dir
          return;
        }
        dirs.push(rpath);
      })
      .on("file", function (file: string, _stat: any) {
        const rpath = path.relative(parentDir, file);
        files.push(rpath);
      })
      .on("error", function (er: Error, entry: string, _stat: any) {
        reject("walker traverse got error " + er + " on entry " + entry);
      })
      .on("end", function () {
        files.sort();
        dirs.sort();
        resolve({ files, dirs });
      });
  });
}

function generateFileHash(dir: string, rpath: string) {
  const joinedPath = path.join(dir, rpath);
  const fileBuffer = fs.readFileSync(joinedPath);
  const fileHash = crypto.createHash("md5").update(fileBuffer).digest("hex");
  return fileHash;
}

type OperationType = {
  target: string;
  action: string;
  oldMd5?: string | null;
  newMd5?: string | null;
};

export function folderBsdiff(
  oldDir: string,
  newDir: string,
  patchPath: string
) {
  return Promise.all([getRelativePaths(oldDir), getRelativePaths(newDir)]).then(
    (responses) => {
      const oldPaths = responses[0];
      const newPaths = responses[1];
      const { files: oldFilePaths, dirs: oldDirPaths } = oldPaths;
      const { files: newFilePaths, dirs: newDirPaths } = newPaths;
      const fileDiffMap = new Map<string, string>();
      oldFilePaths.forEach((rpath) => {
        fileDiffMap.set(rpath, OPERATION_ACTION.DELETE_FILE);
      });
      newFilePaths.forEach((rpath) => {
        if (fileDiffMap.has(rpath)) {
          if (
            generateFileHash(oldDir, rpath) === generateFileHash(newDir, rpath)
          ) {
            fileDiffMap.delete(rpath);
          } else {
            fileDiffMap.set(rpath, OPERATION_ACTION.MODIFY_FILE);
          }
        } else {
          fileDiffMap.set(rpath, OPERATION_ACTION.ADD_FILE);
        }
      });
      const fileOperations = [] as OperationType[];
      fileDiffMap.forEach((action: string, target: string) => {
        let oldMd5;
        let newMd5;
        switch (action) {
          case OPERATION_ACTION.ADD_FILE:
            newMd5 = generateFileHash(newDir, target);
            fileOperations.push({
              target,
              action,
              newMd5,
            });
            break;
          case OPERATION_ACTION.DELETE_FILE:
            oldMd5 = generateFileHash(oldDir, target);
            fileOperations.push({
              target,
              action,
              oldMd5,
            });
            break;
          case OPERATION_ACTION.MODIFY_FILE:
            oldMd5 = generateFileHash(oldDir, target);
            newMd5 = generateFileHash(newDir, target);
            fileOperations.push({
              target,
              action,
              oldMd5,
              newMd5,
            });
            break;
        }
      });
      const dirDiffMap = new Map();
      oldDirPaths.forEach((rpath) => {
        dirDiffMap.set(rpath, OPERATION_ACTION.DELETE_DIR);
      });
      newDirPaths.forEach((rpath) => {
        if (dirDiffMap.has(rpath)) {
          dirDiffMap.delete(rpath);
        } else {
          dirDiffMap.set(rpath, OPERATION_ACTION.ADD_DIR);
        }
      });
      const addDirOperations = [] as OperationType[];
      const deleteDirOperations = [] as OperationType[];
      dirDiffMap.forEach((action, target) => {
        const delegatedOperations =
          action === OPERATION_ACTION.ADD_DIR
            ? addDirOperations
            : deleteDirOperations;
        delegatedOperations.push({
          target,
          action,
        });
      });
      // Operations to add directories gets sorted from long to short will create parent dir first
      addDirOperations.sort((a, b) => a.target.length - b.target.length);
      // Operation to delete directories gets sorted from short to long will delete subdir first
      deleteDirOperations.sort((a, b) => b.target.length - a.target.length);
      const operations = [
        ...addDirOperations,
        ...fileOperations,
        ...deleteDirOperations,
      ];
      const fpatchTmpDir = `/tmp/fpatch_${+new Date()}_${Math.floor(
        Math.random() * 10000
      )}`;
      fs.ensureDirSync(fpatchTmpDir);
      fs.emptyDirSync(fpatchTmpDir);
      const patchesDir = path.join(fpatchTmpDir, "patches");
      fs.ensureDirSync(patchesDir);
      fileOperations.forEach((operation) => {
        if (operation.action === OPERATION_ACTION.DELETE_FILE) {
          return;
        }
        const relativeDirName = path.dirname(operation.target);
        const fullDirNameInPatches = path.join(patchesDir, relativeDirName);
        const pureFilename = path.basename(operation.target);
        fs.ensureDirSync(fullDirNameInPatches);
        if (operation.action === OPERATION_ACTION.MODIFY_FILE) {
          bsdp.diff(
            path.join(oldDir, operation.target),
            path.join(newDir, operation.target),
            path.join(fullDirNameInPatches, `${pureFilename}.patch`)
          );
        } else if (operation.action === OPERATION_ACTION.ADD_FILE) {
          fs.copyFileSync(
            path.join(newDir, operation.target),
            path.join(fullDirNameInPatches, pureFilename)
          );
        }
      });

      const config = {
        name: "FolderBsdp",
        version: FOLDER_BSDP_VERSION,
        operations,
      };

      const configStr = JSON.stringify(config);
      fs.writeFileSync(path.join(fpatchTmpDir, "config.json"), configStr);
      return archiveTask(fpatchTmpDir, patchPath).then(() => {
        fs.rmdirSync(fpatchTmpDir, { recursive: true });
      });
    }
  );
}

function archiveTask(resourceDir: string, targetFilePath: string) {
  return new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(targetFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });
    output.on("close", function () {
      resolve();
    });
    archive.on("warning", function (err) {
      reject(err);
    });
    archive.on("error", function (err) {
      reject(err);
    });
    archive.pipe(output);
    archive.directory(resourceDir, false);
    archive.finalize();
  });
}
