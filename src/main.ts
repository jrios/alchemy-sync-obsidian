import { Menu, MenuItem, Plugin, TFile, TFolder } from "obsidian";
import {
  DEFAULT_SETTINGS,
  AlchemySyncPluginSettings,
  AlchemySyncSettingTab,
} from "./settings";
import { AlchemySyncer } from "./sync";
import { AlchemyUniverse } from "types";
import path from "path";

export default class AlchemySyncPlugin extends Plugin {
  settings: AlchemySyncPluginSettings;
  storageKey: string = "alchemy:universes";
  statusBarItem: HTMLElement;

  async onload() {
    await this.loadSettings();
    const syncer = new AlchemySyncer(this, this.app.vault);
    syncer.registerCommands();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AlchemySyncSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-menu", async (menu: Menu, file: TFile) => {
        // Assume that a sync has happened before adding any context menu options
        const references = this.app.loadLocalStorage(this.storageKey) as
          | AlchemyUniverse[]
          | null;
        if (references !== null) {
          if (file instanceof TFolder) {
            const parts = file.path.split("/");
            const universe = references.find((u) => u.name === file.name);
            if (universe === undefined) {
              const universeName = parts[1];
              const universe = references.find((u) => u.name === universeName);
              const module = universe?.modules.find(
                (m) => m.name === file.name,
              );

              if (module !== undefined) {
                menu.addItem((item: MenuItem) => {
                  item
                    .setTitle("Create Alchemy-linked Note")
                    .onClick(async () => {
                      const notePath = path.join(file.path, "Untitled.md");
                      const newFile = await this.app.vault.create(notePath, "");
                      await this.app.fileManager.processFrontMatter(
                        newFile,
                        (frontmatter) => {
                          Object.assign(frontmatter, {
                            alchemyUniverseId: universe!.id,
                            alchemyModuleId: module.id,
                          });
                        },
                      );
                    });
                });
              }
            }
          }
        }
      }),
    );

    this.statusBarItem = this.addStatusBarItem();

    const storage = this.app.loadLocalStorage(this.storageKey);
    if (storage !== null) {
      const d = new Date(storage.lastSyncedTimeStamp);
      this.updateSyncStatus(d);
    }
  }

  onunload() {
    // this.app.saveLocalStorage(this.storageKey, null);
  }

  async loadSettings() {
    const loadedData =
      (await this.loadData()) as Partial<AlchemySyncPluginSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateSyncStatus(d: Date) {
    let locale = "en-US";
    if (typeof navigator !== "undefined" && navigator.language) {
      locale = navigator.language;
    }

    const formatter = new Intl.DateTimeFormat(locale, {
      timeStyle: "long",
    });
    this.statusBarItem.empty();
    this.statusBarItem.createEl("span", {
      text: `Last Alchemy Universe sync: ${formatter.format(d)}`,
    });
  }
}
