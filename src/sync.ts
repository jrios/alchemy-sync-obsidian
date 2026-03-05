import AlchemySyncPlugin from "main";
import { AlchemyApiWrapper } from "alchemy";
import { Notice, TFile, Vault } from "obsidian";
import { NoteManager } from "notes";
import { maybeCreateFolder } from "files";
import { AlchemyArticle } from "types";

export type AlchemySyncPluginError = {
  message: string;
  duration?: number;
};

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
      id: "sync-vault-from-alchemy",
      name: "Sync Vault from Alchemy",
      callback: async () => {
        const result = await this.syncVaultFromAlchemy();
        if (result !== null) {
          new Notice(result.message, result.duration);
        } else {
          new Notice("Notes synced from Alchemy Universes.");
          this.plugin.updateSyncStatus(new Date());
        }
      },
    });

    this.plugin.addCommand({
      id: "sync-vault-to-alchemy",
      name: "Sync Vault to Alchemy",
      callback: async () => {
        const result = await this.syncVaultToAlchemy();
        if (result !== null) {
          new Notice(result.message, result.duration);
        } else {
          new Notice("Vault synced to Alchemy Universes");
        }
      },
    });

    this.plugin.addCommand({
      id: "sync-note-to-alchemy",
      name: "Sync Note to Alchemy",
      callback: async () => {
        const activeFile = this.plugin.app.workspace.activeEditor?.file;
        if (activeFile !== null) {
          const result = await this.syncNoteToAlchemy(activeFile!);
          if (result !== null) {
            new Notice(result.message, result.duration);
          } else {
            new Notice(`Synced ${activeFile!.name} to Alchemy.`);
          }
        }
      },
    });

    this.plugin.addCommand({
      id: "sync-note-from-alchemy",
      name: "Sync Note from Alchemy",
      callback: async () => {
        const activeFile = this.plugin.app.workspace.activeEditor?.file;
        if (activeFile !== null) {
          const result = await this.syncNoteFromAlchemy(activeFile!);
          if (result !== null) {
            new Notice(result.message, result.duration);
          } else {
            new Notice(`Synced ${activeFile!.name} from Alchemy.`);
          }
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

  async syncNoteToAlchemy(note: TFile): Promise<AlchemySyncPluginError | null> {
    const syncResult = this.ensureAbilityToSync();

    if (syncResult !== null) {
      return syncResult;
    }

    const syncableNotesResult = await this.noteManager.getSyncableNote(note);
    return await this.alchemy.createOrUpdateArticles([syncableNotesResult]);
  }

  async syncVaultFromAlchemy(): Promise<AlchemySyncPluginError | null> {
    const syncResult = this.ensureAbilityToSync();

    if (syncResult !== null) {
      return syncResult;
    }

    const root = this.vault.getRoot();
    if (this.plugin.settings.targetFolder === root.path) {
      return {
        message: "Cannot use the vault's root path as the Alchemy folder",
      };
    }

    await maybeCreateFolder(this.vault, this.plugin.settings.targetFolder);

    const loadUniversesResult = await this.alchemy.loadAlchemyUniverses();
    if (Array.isArray(loadUniversesResult)) {
      const syncNotesResult =
        await this.noteManager.syncNotesFromAlchemy(loadUniversesResult);
      if (syncNotesResult !== null) {
        return syncNotesResult;
      }

      this.plugin.app.saveLocalStorage(this.plugin.storageKey,
        {
          universes: loadUniversesResult.map((u) => ({
            id: u.id,
            name: u.name,
            modules: u.modules.map((m) => ({
              id: m.id,
              name: m.name,
              articles: m.articles.map((a) => ({
                id: a.id,
                title: a.title,
              }))
            }))
          })),
          lastSyncedTimeStamp: new Date(),
        },
      );
      await this.noteManager.replaceAlchemyLinksInFiles();
      return null;
    } else {
      return loadUniversesResult;
    }
  }

  async syncNoteFromAlchemy(
    file: TFile,
  ): Promise<AlchemySyncPluginError | null> {
    const syncResult = this.ensureAbilityToSync();

    if (syncResult !== null) {
      return syncResult;
    }

    const cachedFile = this.plugin.app.metadataCache.getFileCache(file);
    if (cachedFile === null) {
      return {
        message: `Unable to get file cache for ${file.name}`,
      };
    }
    const cachedFileFrontmatter = cachedFile.frontmatter;
    if (!cachedFileFrontmatter) {
      return {
        message: "Cannot sync file with no Alchemy Article id",
      };
    }
    if (!cachedFileFrontmatter.alchemyArticleId) {
      return {
        message: "Cannot sync file with no Alchemy Article id",
      };
    }

    const note = await this.noteManager.getSyncableNote(file);
    const articleResponse = await this.alchemy.loadArticle(
      note.alchemyArticleId!,
    );
    if (articleResponse.hasOwnProperty("message")) {
      return articleResponse as AlchemySyncPluginError;
    }

    let body = (articleResponse as AlchemyArticle).body;

    body = await this.noteManager.replaceAlchemyLinks(
      body,
      this.noteManager.markdownFiles(),
    );

    await this.vault.modify(file, body);

    try {
      await this.plugin.app.fileManager.processFrontMatter(
        file,
        (frontmatter) => {
          Object.assign(frontmatter, cachedFileFrontmatter);
        },
      );
    } catch (err) {
      return {
        message: `Failed to write frontmatter for note ${file.name}`,
      };
    }
    return null;
  }

  ensureAbilityToSyncToAlchemy(
    alchemyUniverseId: string,
    alchemyModuleId: string,
    alchemyArticleId: string,
  ): AlchemySyncPluginError | null {
    const hasAlchemyIdentifiers =
      (alchemyUniverseId !== "" && alchemyModuleId !== "") ||
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
