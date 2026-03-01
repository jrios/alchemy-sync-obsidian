import AlchemySyncPlugin from "main";
import path from "path";
import { getFrontMatterInfo, normalizePath, Vault } from "obsidian";
import { AlchemyUniverse } from "types";
import { maybeCreateFolder } from "files";
import { AlchemySyncPluginError } from "sync";

export type SyncableNote = {
  alchemyUniverseId: string;
  alchemyModuleId: string;
  alchemyArticleId: string | undefined;

  onArticleCreated: (articleId: string) => Promise<AlchemySyncPluginError | null>;

  title: string;
  body: string;
}

export class NoteManager {
  private plugin: AlchemySyncPlugin;
  private vault: Vault;

  constructor(plugin: AlchemySyncPlugin, vault: Vault) {
    this.plugin = plugin;
    this.vault = vault;
  }

  async getSyncableNotes(): Promise<Array<SyncableNote> | AlchemySyncPluginError> {
    const folder = this.plugin.settings.targetFolder;
    const markdownFiles = this.vault.getMarkdownFiles().filter(f => f.parent?.path.startsWith(folder));

    const notes = [];
    for (const f of markdownFiles) {
      const fileCache = this.plugin.app.metadataCache.getFileCache(f);
      const frontmatter = fileCache?.frontmatter;

      const onArticleCreated = async (articleId: string): Promise<AlchemySyncPluginError | null> => {
        try {
          await this.plugin.app.fileManager.processFrontMatter(
            f,
            (frontmatter) => {
              Object.assign(frontmatter, {
                alchemyArticleId: articleId,
              })
            }
          )
          return null;
        } catch (err) {
          return {
            message: `Failed to add article ID [${articleId}] to note [${f.basename}] frontmatter.`,
            duration: 0
          };
        }
      }

      const syncableNote: SyncableNote = {
        alchemyUniverseId: frontmatter!.alchemyUniverseId,
        alchemyModuleId: frontmatter!.alchemyModuleId,
        alchemyArticleId: frontmatter!.alchemyArticleId,
        title: f.basename,
        body: '',
        onArticleCreated
      };

      const contents = await this.vault.cachedRead(f);
      const { contentStart } = getFrontMatterInfo(contents);
      syncableNote.body = contents.slice(contentStart);

      notes.push(syncableNote);
    }
    return notes;
  }


  async syncNotesFromAlchemy(universes: Array<AlchemyUniverse>): Promise<AlchemySyncPluginError | null> {
    const workingUniverses = universes.filter((u) => u.modules.length > 0);


    const failedArticles: {
      moduleName: string;
      articleTitle: string;
    }[] = [];

    for (let idx = 0; idx < workingUniverses.length; idx++) {
      let workingPath = normalizePath(this.plugin.settings.targetFolder);
      const universe = workingUniverses[idx]!;
      const universeFolderName = this.plugin.settings.replaceSpacesInFolderNames
        ? universe.name.replaceAll(
          " ",
          this.plugin.settings.noteNameCharacterReplacement,
        )
        : universe.name;
      if (this.plugin.settings.groupNotesInUniverseFolders) {
        workingPath = path.join(workingPath, universeFolderName);

        await maybeCreateFolder(this.vault, workingPath);
      }

      for (let modIdx = 0; modIdx < universe.modules.length; modIdx++) {
        const module = universe.modules[modIdx]!;
        const moduleFolderName = this.plugin.settings.replaceSpacesInFolderNames
          ? module.name.replaceAll(
            " ",
            this.plugin.settings.noteNameCharacterReplacement,
          )
          : module.name;

        if (this.plugin.settings.groupNotesInModuleFolders) {
          workingPath = path.join(workingPath, moduleFolderName);
          await maybeCreateFolder(this.vault, workingPath);
        }

        for (
          let articleIdx = 0;
          articleIdx < module.articles.length;
          articleIdx++
        ) {
          const article = module.articles[articleIdx]!;
          const notePath = path.join(workingPath, `${article.title}.md`);

          let note = this.vault.getFileByPath(notePath);
          if (note === null) {
            note = await this.vault.create(notePath, article.body);
          } else {
            await this.vault.modify(note, article.body);
          }

          const frontmatterData = {
            alchemyUniverseId: universe.id,
            alchemyModuleId: module.id,
            alchemyArticleId: article.id,
          };

          try {
            await this.plugin.app.fileManager.processFrontMatter(
              note,
              (frontmatter) => {
                Object.assign(frontmatter, frontmatterData);
              },
            );
          } catch (err) {
            failedArticles.push({
              moduleName: module.name,
              articleTitle: article.title
            });
          }
        }
      }
    }

    if (failedArticles.length > 0) {
      const message = `Failed to process frontmatter for Articles: 
  
        ${failedArticles.map(fa => `Module: ${fa.moduleName}, Article: ${fa.moduleName}\n`)}
      `
      return {
        message
      };
    }

    return null;
  }

}
