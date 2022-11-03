import path from "path";
import fs from "fs-extra";
import extract from "extract-zip";
import crypto from "crypto";
// @ts-ignore
import bsdp from "bsdp";

const OPERATION_ACTION = {
  ADD_DIR: "add_dir",
  ADD_FILE: "add_file",
  DELETE_FILE: "delete_file",
  MODIFY_FILE: "modify_file",
  DELETE_DIR: "delete_dir",
};

function generateFileHash(filePath: string) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash("md5").update(fileBuffer).digest("hex");
  return fileHash;
}

export function folderBspatch(
  oldDir: string,
  newDir: string,
  patchPath: string
) {
  // Step 1: copy content of old dir to new dir.
  if (fs.existsSync(newDir)) {
    fs.rmdirSync(newDir, { recursive: true });
  }
  fs.copySync(oldDir, newDir);
  // Step 2: extract fpatch compressed file
  const fpatchUnzippedDir = `/tmp/fpatch_${+new Date()}_${Math.floor(
    Math.random() * 10000
  )}`;
  return extract(patchPath, { dir: fpatchUnzippedDir })
    .then(() => {
      const rawData = fs.readFileSync(
        path.join(fpatchUnzippedDir, "config.json")
      );
      // @ts-ignore
      const config = JSON.parse(rawData);
      if (config.name !== "FolderBsdp" || config.version !== 1) {
        throw new Error("The config file is not FolderBsdp version 1");
      }
      config.operations.forEach(
        (operation: {
          action: string;
          target: string;
          tool: string;
          oldMd5?: string | null;
          newMd5?: string | null;
        }) => {
          switch (operation.action) {
            case OPERATION_ACTION.ADD_DIR:
              fs.mkdirSync(path.join(newDir, operation.target));
              break;
            case OPERATION_ACTION.ADD_FILE:
              const filePathInPatches = path.join(
                path.join(fpatchUnzippedDir, "patches"),
                operation.target
              );
              const filePathInNew = path.join(newDir, operation.target);
              fs.copyFileSync(filePathInPatches, filePathInNew);
              if (generateFileHash(filePathInNew) !== operation.newMd5) {
                throw new Error(
                  `Add action fails. The md5 of ${operation.target} in new folder does not match the newMd5 in config.json.`
                );
              }
              break;
            case OPERATION_ACTION.DELETE_FILE:
              const filePathToDelete = path.join(newDir, operation.target);
              if (generateFileHash(filePathToDelete) !== operation.oldMd5) {
                throw new Error(
                  `Unable to delete. The md5 of ${operation.target} does not match the oldMd5 in config.json.`
                );
              }
              fs.unlinkSync(filePathToDelete);
              break;
            case OPERATION_ACTION.MODIFY_FILE:
              const filePathBeforeModify = path.join(oldDir, operation.target);
              const filePathAfterModify = path.join(newDir, operation.target);
              if (generateFileHash(filePathBeforeModify) !== operation.oldMd5) {
                throw new Error(
                  `Unable to patch. The md5 of ${operation.target} in old folder does not match the oldMd5 in config.json.`
                );
              }
              // bsdp.patch will replace the current file content in new file path
              bsdp.patch(
                filePathBeforeModify,
                filePathAfterModify,
                path.join(
                  path.join(fpatchUnzippedDir, "patches"),
                  operation.target
                ) + ".patch"
              );
              if (generateFileHash(filePathAfterModify) !== operation.newMd5) {
                throw new Error(
                  `Patched but encountered error. The md5 of ${operation.target} in new folder does not match the newMd5 in config.json.`
                );
              }
              break;
            case OPERATION_ACTION.DELETE_DIR:
              fs.rmdirSync(path.join(newDir, operation.target));
              break;
            default:
              throw new Error(
                `Operation action ${operation.action} is not supported`
              );
          }
        }
      );
    })
    .then(() => {
      fs.rmdirSync(fpatchUnzippedDir, { recursive: true });
    });
}
