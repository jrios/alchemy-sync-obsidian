import {
  App,
  PluginSettingTab,
  SecretComponent,
  Setting,
  normalizePath,
} from "obsidian";
import AlchemySyncPlugin from "./main";

export interface AlchemySyncPluginSettings {
  token: string;
  targetFolder: string;
  replaceSpacesInFolderNames: boolean;
  noteNameCharacterReplacement: string;
  groupNotesInUniverseFolders: boolean;
  groupNotesInModuleFolders: boolean;
}

export const DEFAULT_SETTINGS: AlchemySyncPluginSettings = {
  token: "",
  targetFolder: "alchemy",
  replaceSpacesInFolderNames: false,
  noteNameCharacterReplacement: "_",
  groupNotesInUniverseFolders: true,
  groupNotesInModuleFolders: true,
};

export class AlchemySyncSettingTab extends PluginSettingTab {
  plugin: AlchemySyncPlugin;

  constructor(app: App, plugin: AlchemySyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Alchemy User Token")
      .setDesc("Select a secret")
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Target folder")
      .setDesc("The folder where Alchemy module articles are saved")
      .addText((text) =>
        text
          .setPlaceholder("Folder location")
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = normalizePath(value);
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Replace spaces in note names")
      .setDesc(
        "Replace spaces in Universe and Module folder names with a specified character.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.replaceSpacesInFolderNames)
          .onChange(async (value) => {
            this.plugin.settings.replaceSpacesInFolderNames = value;
            await this.plugin.saveSettings();
            this.display();
          }),
      );

    if (this.plugin.settings.replaceSpacesInFolderNames) {
      new Setting(containerEl)
        .setName("Replacement character")
        .setDesc("Replace spaces in folder names with this character")
        .addText((text) => {
          text.inputEl.maxLength = 1;
          text
            .setValue(this.plugin.settings.noteNameCharacterReplacement)
            .onChange(async (value) => {
              this.plugin.settings.noteNameCharacterReplacement = value;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName("Group Universes")
      .setDesc("Group Universes into subdirectories.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.groupNotesInUniverseFolders)
          .onChange(async (value) => {
            this.plugin.settings.groupNotesInUniverseFolders = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Group Modules")
      .setDesc("Group Modules into subdirectories.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.groupNotesInModuleFolders)
          .onChange(async (value) => {
            this.plugin.settings.groupNotesInModuleFolders = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
