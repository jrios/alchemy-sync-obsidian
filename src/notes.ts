import AlchemySyncPlugin from "main";
import path from "path";
import { getFrontMatterInfo, normalizePath, TFile, Vault } from "obsidian";
import { AlchemyUniverse } from "types";
import { maybeCreateFolder } from "files";
import { AlchemySyncPluginError } from "sync";
import { BacklinkOption } from "settings";

export type SyncableNote = {
  alchemyUniverseId: string;
  alchemyModuleId: string;
  alchemyArticleId: string | undefined;

  onArticleCreated: (
    articleId: string,
  ) => Promise<AlchemySyncPluginError | null>;

  title: string;
  body: string;
};

export class NoteManager {
  private plugin: AlchemySyncPlugin;
  private vault: Vault;

  constructor(plugin: AlchemySyncPlugin, vault: Vault) {
    this.plugin = plugin;
    this.vault = vault;
  }

  async getSyncableNotes(): Promise<
    Array<SyncableNote> | AlchemySyncPluginError
  > {
    const notes = [];
    const files = this.markdownFiles();
    for (const f of files) {
      const onArticleCreated = async (
        articleId: string,
      ): Promise<AlchemySyncPluginError | null> => {
        try {
          await this.plugin.app.fileManager.processFrontMatter(
            f,
            (frontmatter) => {
              Object.assign(frontmatter, {
                alchemyArticleId: articleId,
              });
            },
          );
          return null;
        } catch (err) {
          return {
            message: `Failed to add article ID [${articleId}] to note [${f.basename}] frontmatter.`,
            duration: 0,
          };
        }
      };

      const fileCache = this.plugin.app.metadataCache.getFileCache(f);

      const contents = await this.vault.cachedRead(f);
      const backlinks = fileCache?.links || [];

      let body = contents;

      for (const bl of backlinks) {
        // Try to replace all links in the body with Alchemy-formed links/buttons if possible
        // before sending the note to be synced.
        const linkedFile = files.find((f) => f.name === `${bl.link}.md`);
        const replacementType =
          this.plugin.settings.convertBacklinksToArticleTagType;
        if (linkedFile && replacementType !== BacklinkOption.NONE) {
          const linkedFileFrontmatter =
            this.plugin.app.metadataCache.getFileCache(linkedFile)?.frontmatter;

          if (this.canReplaceLink(linkedFileFrontmatter)) {
            const universeId = linkedFileFrontmatter!.alchemyUniverseId!;
            const articleId = linkedFileFrontmatter!.alchemyArticleId;
            const replacement =
              replacementType === BacklinkOption.BUTTON
                ? `![${linkedFile.name}=type:article](${universeId}:${articleId})`
                : `[${linkedFile.name}](alchemy:article:${universeId}:${articleId})`;

            body = body.replaceAll(bl.original, replacement);
          }
        }
      }

      const frontmatter = fileCache?.frontmatter;

      const { contentStart } = getFrontMatterInfo(contents);
      body = body.slice(contentStart);

      const syncableNote: SyncableNote = {
        alchemyUniverseId: frontmatter!.alchemyUniverseId,
        alchemyModuleId: frontmatter!.alchemyModuleId,
        alchemyArticleId: frontmatter!.alchemyArticleId,
        title: f.basename,
        body,
        onArticleCreated,
      };
      notes.push(syncableNote);
    }
    return notes;
  }

  async replaceAlchemyLinks(): Promise<AlchemySyncPluginError | null> {
    const files = this.markdownFiles();

    const alchemyLinkRegex = new RegExp(
      /!?\[([^\]]*?)(?:=type:article)?\]\(((?:alchemy:article:)?([a-f0-9]+):([a-f0-9]+))\)/,
    );

    for (const f of files) {
      let contents = await this.vault.read(f);
      const matches = alchemyLinkRegex.exec(contents);

      if (matches !== null) {
        // Check to see that there is an article that can be linked
        const found = files.find((needle: TFile) => {
          const cache = this.plugin.app.metadataCache.getFileCache(needle)!;
          if (cache.frontmatter) {
            return (
              cache.frontmatter.alchemyUniverseId === matches[3] &&
              cache.frontmatter.alchemyArticleId === matches[4]
            );
          }
          return false;
        });
        if (found) {
          contents = contents.replaceAll(matches[0], `[[${matches[1]}]]`);
          await this.vault.modify(f, contents);
        }
      }
    }

    return null;
  }

  private markdownFiles(): TFile[] {
    const folder = this.plugin.settings.targetFolder;
    return this.vault
      .getMarkdownFiles()
      .filter((f) => f.parent?.path.startsWith(folder));
  }

  async syncNotesFromAlchemy(
    universes: Array<AlchemyUniverse>,
  ): Promise<AlchemySyncPluginError | null> {
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
              articleTitle: article.title,
            });
          }
        }
      }
    }

    if (failedArticles.length > 0) {
      const message = `Failed to process frontmatter for Articles: 
  
        ${failedArticles.map((fa) => `Module: ${fa.moduleName}, Article: ${fa.moduleName}\n`)}
      `;
      return {
        message,
      };
    }

    return null;
  }

  canReplaceLink(frontmatter: any): boolean {
    if (!frontmatter) {
      return false;
    }

    return (
      frontmatter.alchemyUniverseId !== undefined &&
      frontmatter.alchemyUniverseId !== "" &&
      frontmatter.alchemyArticleId !== undefined &&
      frontmatter.alchemyArticleId !== ""
    );
  }
}
