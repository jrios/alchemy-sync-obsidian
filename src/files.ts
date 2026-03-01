import { Vault } from "obsidian";

export async function maybeCreateFolder(vault: Vault, path: string): Promise<void> {
  const folder = vault.getFolderByPath(path);
  if (folder === null) {
    try {
      await vault.createFolder(path);
    } catch (err) {
      // This shouldn't happen because there's a check to see if the folder exists.
      throw err;
    }
  }
}
