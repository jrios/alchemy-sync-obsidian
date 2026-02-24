import { Notice } from 'obsidian';

const GRAPHQL_URL: string = 'https://app.alchemyrpg.com/api/graphql';

type AlchemyUniverse = {
	id string;
	name string;
	modules: Array<AlchemyModule>;
	userIsCollaborator: boolean;
}

type AlchemyModule = {
	id string;
	name string;
	articles Array<AlchemyArticle>;
}

type AlchemyArticle = {
	articleID string;
	articleBody string;
}

class AlchemyApiWrapper {
	private userToken: string;
	private userId: string;
	private alchemyUniverses: Array<AlchemyUniverse>;


	constructor(userToken: string) {
		this.userToken = userToken;
		this.alchemyUniverse = [];
	}

	async loadModuleArticles() {
		const userId = await this.loadUserId();
		const universes = await this.loadUniverses(userId);
		const modules = await this.loadEditableModules(universes, userId);
		const articles = await this.loadArticles(modules);
	}

	private async loadUserId(): string {
		if (!this.userId !== undefined) {
			const reqBody = {
				operationName: "CurrentUser",
				query: `
					query CurrentUser {
						currentUser {
							_id
						}
					}
				`
			};

			const req = this.getRequestWithHeaders(reqBody);

			const response = await fetch(req);

			if (response.ok) {
				const currentUserJson = await response.json();
				const currentUser = currentUserJson.data.currentUser;
				this.userId = currentUser._id;
			} else {
				new Notice('Failed to load User ID');
			}
		}
		return this.userId;
	}

	private async loadUniverses(userId): Array{
		const reqBody = {
		  operationName: "Universes",
		  variables: {},
		  query: `
			query Universes {
			  universes {
				universes {
					_id
					name
					slug
					systemKey
					systemName
					systemAbbreviation
					collaborators {
						userId
						role
					}
				}
			  }
			}`
		};

		const req = this.getRequestWithHeaders(reqBody);

		const response = await fetch(req);
		let universes = [];
		if (response.ok) {
			// Load all the modules for these universes
			// and the articles connected to those modules.
			const universesJson = await response.json();
			universes = universesJson.data.universes.universes;

			this.universes = universes.map(u => ({
				id: u._id,
				name: u.name,
				modules: [],
				userIsCollaborator: u.collaborators.map(c => c.userId).includes(userId)
			}));
		} else {
			new Notice('Failed to load Universes');
		}

		return universes;
	}

	private async loadEditableModules(universes, userId): Array {
		let editableModules = [];
		for (let idx = 0; idx < this.universes.length; idx++) {
			const universe = this.universes[idx];
			const reqBody = {
				operationName: "ModuleShelf",
				variables: {
					universeId: universe.id,
				},
				query: `
					query ModuleShelf($universeId: ID!) {
						moduleShelf(universeId: $universeId) {
							_id
							name
							slug
							resources
							userId
						}
					}`
			};

			const req = this.getRequestWithHeaders(reqBody);
			const response = await fetch(req);

			if (response.ok) {
				// Load all the modules for the passed in universes
				// If the user ID is part of collaborators, load all the modules
				// Otherwise, assume they are not a collaborator and load only the modules in which
				// the user ID is set.
				const modulesJson = await response.json();
				const modules = modulesJson.data.moduleShelf;

				if (universe.userIsCollaborator) {
					editableModules.push(...modules);
				} else {
					const userModules = modules.filter(mod => mod.userId === userId);
					editableModules.push(...userModules);
				}
			} else {
				new Notice('Failed to load Modules');
			}
		}

		return editableModules;
	}

	private async loadArticles(modules) {
		let articleIds = [];

		for (let idx = 0; idx < modules.length; idx++) {
			const {resources} = modules[idx];

			for (let resourceIdx = 0; resourceIdx < resources.length; resourceIdx++) {
				const resource = resources[resourceIdx];
				const resourceParts = resource.split(":");
				const type = resourceParts[1];
				const id = resourceParts[2];
				if (type === 'article') {
					articleIds.push(id);
				}
			}
		}

		for (let idx = 0; idx < articleIds.length; idx++) {
			const articleId = articleIds[idx];
			const reqBody = {
				operationName: "Article",
				variables: {
					_id: articleId,
				},
				query: `
					query Article($_id: ID!) {
						article(_id: $_id) {
							_id
							title
							body
						}
					}`
			};

			const req = this.getRequestWithHeaders(reqBody);
			const response = await fetch(req);

			if (response.ok) {
				// Load all the modules for the passed in universes
				// If the user ID is part of collaborators, load all the modules
				// Otherwise, assume they are not a collaborator and load only the modules in which
				// the user ID is set.
				const articleJson = await response.json();
				const article = articleJson.data.article;
				console.log(article);
			} else {
				new Notice('Failed to load Articles');
			}
		}
	}

	getRequestWithHeaders(queryBody) {
		const headers = new Headers();
		headers.append("content-type", "application/json");
		headers.append("authorization", this.userToken);

		return new Request(GRAPHQL_URL, {
		  method: 'POST',
		  headers,
		  body: JSON.stringify(queryBody)
		});
	}
}

export class AlchemySyncer {
	private plugin: AlchemySyncPlugin;
	private alchemy: AlchemyApiWrapper;

	constructor(plugin: AlchemySyncPlugin) {
		this.plugin = plugin;

		const alchemyAuthToken = this.getToken();
		this.alchemy = new AlchemyApiWrapper(alchemyAuthToken);

		this.plugin.addRibbonIcon('refresh-ccw', 'Sync Alchemy', (evt: MouseEvent) => {
			this.syncVaultToAlchemy();
		});

		this.plugin.addCommand({
			id: "sync-from-alchemy",
			name: "Sync Vault to Alchemy",
			callback: () => {
				this.syncVaultToAlchemy();
			},
		});
	}

	async syncVaultToAlchemy(options?: { debugLimit?: number }): Promise<void> {
		const canSyncResult = await this.ensureAbilityToSync();

		if (!canSyncResult.canSync) {
			new Notice(validation.errorMessage || 'Unable to sync to Alchemy');
			return;
		}

		try {
			const moduleArticles = this.alchemy.loadModuleArticles();
			new Notice('Syncing...');
		} catch (error) {
			console.error("Sync failed:", error);
		}
	}

	async ensureAbilityToSync(): Promise<{
		canSync: boolean;
		errorMessage?: string;
	}> {
		const userToken = this.getToken();

		const isUserTokenMissing = !userToken || userToken.trim() === "";

		if (isUserTokenMissing) {
			return {
				canSync: false,
				errorMessage:
					"Please enter your Alchemy user token in the settings.",
			};
		}

		return { canSync: true };
	}

	getToken(): string {
		const secretName = this.plugin.settings.token?.trim();
		let userToken;
		if (secretName && secretName !== "") {
			userToken = this.plugin.app.secretStorage.getSecret(secretName);
		}
		return userToken;
	}
}
