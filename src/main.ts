import { Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  AlchemySyncPluginSettings,
  AlchemySyncSettingTab,
} from "./settings";
import { AlchemySyncer } from "./sync";

export default class AlchemySyncPlugin extends Plugin {
  settings: AlchemySyncPluginSettings;

  async onload() {
    await this.loadSettings();
    const syncer = new AlchemySyncer(this, this.app.vault);
    syncer.registerCommands();

    // This adds a settings tab so the user can configure various aspects of the plugin
    this.addSettingTab(new AlchemySyncSettingTab(this.app, this));

    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    this.registerInterval(
      window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000),
    );
  }

  onunload() { }

  async loadSettings() {
    const loadedData =
      (await this.loadData()) as Partial<AlchemySyncPluginSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
