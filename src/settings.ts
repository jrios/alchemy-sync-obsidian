import {App, PluginSettingTab, SecretComponent, Setting, normalizePath} from "obsidian";
import AlchemySyncPlugin from "./main";

export interface AlchemySyncPluginSettings {
	token: string;
	targetFolder: string;
}

export const DEFAULT_SETTINGS: AlchemySyncPluginSettings = {
	token: '',
	targetFolder: '',
}

export class AlchemySyncSettingTab extends PluginSettingTab {
	plugin: AlchemySyncPlugin;

	constructor(app: App, plugin: AlchemySyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Alchemy User Token')
			.setDesc('Select a secret')
			.addComponent(el => new SecretComponent(this.app, el)
				.setValue(this.plugin.settings.token)
				.onChange(async (value) => {
					this.plugin.settings.token = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName('Target folder')
			.setDesc('The folder where Alchemy module articles are saved')
			.addText(text => text
				.setPlaceholder('Folder location')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = normalizePath(value);
					await this.plugin.saveSettings();
				}));
	}
}
