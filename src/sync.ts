import AlchemySyncPlugin from "main";
import { AlchemyApiWrapper } from "alchemy";
import { Notice, Vault } from "obsidian";
import { NoteManager } from "notes";
import { maybeCreateFolder } from "files";

export type AlchemySyncPluginError = {
  message: string;
  duration?: number;
}

export class AlchemySyncer {
  private plugin: AlchemySyncPlugin;
  private alchemy: AlchemyApiWrapper;
  private vault: Vault;
  private noteManager: NoteManager;

  constructor(plugin: AlchemySyncPlugin, vault: Vault) {
    this.plugin = plugin;
    this.vault = vault;

    const alchemyAuthToken = this.getToken();
    this.alchemy = new AlchemyApiWrapper(alchemyAuthToken!);

    this.noteManager = new NoteManager(this.plugin, this.vault);
  }

  registerCommands() {
    this.plugin.addCommand({
      id: "sync-from-alchemy",
      name: "Sync Vault from Alchemy",
      callback: async () => {
        const result = await this.syncVaultFromAlchemy();
        if (result !== null) {
          new Notice(result.message, result.duration);
        }
      },
    });

    this.plugin.addCommand({
      id: "sync-to-alchemy",
      name: "Sync Vault to Alchemy",
      callback: async () => {
        const result = await this.syncVaultToAlchemy();
        if (result !== null) {
          new Notice(result.message, result.duration);
        }
      },
    });
  }

  async syncVaultToAlchemy(): Promise<AlchemySyncPluginError | null> {
    const syncResult = this.ensureAbilityToSync();

    if (syncResult !== null) {
      return syncResult;
    }

    const syncableNotesResult = await this.noteManager.getSyncableNotes();
    if (Array.isArray(syncableNotesResult)) {
      return await this.alchemy.createOrUpdateArticles(syncableNotesResult);
    } else {
      return syncableNotesResult;
    }
  }

  async syncVaultFromAlchemy(): Promise<AlchemySyncPluginError | null> {
    const syncResult = this.ensureAbilityToSync();

    if (syncResult !== null) {
      return syncResult;
    }

    const root = this.vault.getRoot();
    if (this.plugin.settings.targetFolder === root.path) {
      return {
        message: "Cannot use the vault's root path as the Alchemy folder"
      }
    }

    await maybeCreateFolder(this.vault, this.plugin.settings.targetFolder);

    const loadUniversesResult = await this.alchemy.loadAlchemyUniverses();
    if (Array.isArray(loadUniversesResult)) {
      const syncNotesResult = await this.noteManager.syncNotesFromAlchemy(loadUniversesResult);
      if (syncNotesResult !== null) {
        return syncNotesResult;
      }

      return await this.noteManager.replaceAlchemyLinks();
    } else {
      return loadUniversesResult;
    }
  }

  ensureAbilityToSyncToAlchemy(
    alchemyUniverseId: string,
    alchemyModuleId: string,
    alchemyArticleId: string,
  ): AlchemySyncPluginError | null {
    const hasAlchemyIdentifiers = (alchemyUniverseId !== "" &&
      alchemyModuleId !== "") ||
      alchemyArticleId !== "";

    if (!hasAlchemyIdentifiers) {
      return { message: "Alchemy identifiers are missing" };
    }
    return null;
  }

  ensureAbilityToSync(): AlchemySyncPluginError | null {
    const userToken = this.getToken();

    const isUserTokenMissing = !userToken || userToken.trim() === "";

    if (isUserTokenMissing) {
      return {
        message: "Please enter your Alchemy user token in the settings.",
      };
    }

    return null;
  }

  getToken(): string | null {
    const secretName = this.plugin.settings.token?.trim();
    if (secretName && secretName !== "") {
      return this.plugin.app.secretStorage.getSecret(secretName);
    }
    return null;
  }
}
