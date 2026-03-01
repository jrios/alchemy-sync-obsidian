import { SyncableNote } from "notes";
import { AlchemySyncPluginError } from "sync";
import { AlchemyArticle, AlchemyUniverse, AlchemyUser } from "types";

const GRAPHQL_URL: string = "https://app.alchemyrpg.com/api/graphql";

export class AlchemyApiWrapper {
  private userToken: string;
  private user: AlchemyUser;
  private alchemyUniverses: Array<AlchemyUniverse>;

  constructor(userToken: string) {
    this.userToken = userToken;
    this.alchemyUniverses = [];
  }

  async createOrUpdateArticles(notesToSync: Array<SyncableNote>): Promise<AlchemySyncPluginError | null> {
    const user = await this.loadUser();
    if (user === null) {
      return {
        message: "Could not load Alchemy user."
      };
    }

    const failedNoteTitles: string[] = [];
    for (const note of notesToSync) {
      let articleId = note.alchemyArticleId;
      if (!articleId) {
        // Create a new note in the desired Alchemy module
        const reqBody = {
          operationName: "CreateOrUpdateArticle",
          variables: {
            input: {
              activeModuleId: note.alchemyModuleId,
              universeId: note.alchemyUniverseId,
              author: user.username,
            },
          },
          query: `
            mutation CreateOrUpdateArticle($input: ArticleInput!) {
              createOrUpdateArticle(input: $input) {
                _id
              }
            }
          `,
        };

        const req = this.getRequestWithHeaders(reqBody);

        const response = await fetch(req);

        if (response.ok) {
          const createArticleJson = await response.json();
          articleId = createArticleJson.data.createOrUpdateArticle._id

          const reqBody2 = {
            operationName: "AddResourceToMarketplaceItem",
            variables: {
              marketplaceItemId: note.alchemyModuleId,
              resource: `arn:article:${articleId}`
            },
            query: `
            mutation AddResourceToMarketplaceItem($marketplaceItemId: ID!, $resource: String!) {
              addResourceToMarketplaceItem(marketplaceItemId: $marketplaceItemId, resource: $resource) {
                _id
              }
            }
          `,
          };

          const req2 = this.getRequestWithHeaders(reqBody2);

          const response2 = await fetch(req2);

          if (!response2.ok) {
            // handle error
          }

          await note.onArticleCreated(articleId!);
        } else {
          // handle error
        }
      }

      // Now update the article
      const reqBody = {
        operationName: "CreateOrUpdateArticle",
        variables: {
          input: {
            _id: articleId,
            title: note.title,
            body: note.body,
          },
        },
        query: `
            mutation CreateOrUpdateArticle($input: ArticleInput!) {
              createOrUpdateArticle(input: $input) {
                _id
              }
            }
          `,
      };

      const req = this.getRequestWithHeaders(reqBody);

      const response = await fetch(req);

      if (!response.ok) {
        failedNoteTitles.push(note.title);
      }
    }

    if (failedNoteTitles.length > 0) {
      const err = `
        Failed to sync notes:

        ${failedNoteTitles.join("\n")}
        `;

      return {
        message: err
      };
    }

    return null;
  }

  async loadAlchemyUniverses(): Promise<Array<AlchemyUniverse> | AlchemySyncPluginError> {
    const user = await this.loadUser();
    if (user === null) {
      return {
        message: "Could not load Alchemy user."
      };
    }

    const loadUniversesResult = await this.loadUniverses(user.id);
    if (loadUniversesResult !== null) { return loadUniversesResult; }

    const loadModulesResult = await this.loadEditableModules(user.id);
    if (loadModulesResult !== null) { return loadModulesResult; }


    const loadArticlesResult = await this.loadArticles();
    if (loadArticlesResult !== null) { return loadArticlesResult; }
    return this.alchemyUniverses;
  }

  private async loadUser(): Promise<AlchemyUser | null> {
    if (this.user === undefined) {
      const reqBody = {
        operationName: "CurrentUser",
        variables: {},
        query: `
        query CurrentUser {
                currentUser {
                        _id
                        username
                }
        }
				`,
      };

      const req = this.getRequestWithHeaders(reqBody);

      const response = await fetch(req);

      if (response.ok) {
        const currentUserJson = await response.json();
        const currentUser = currentUserJson.data.currentUser;
        this.user = {
          id: currentUser._id,
          username: currentUser.username,
        };
      } else {
        return null;
      }
    }
    return this.user;
  }

  private async loadUniverses(userId: string): Promise<AlchemySyncPluginError | null> {
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
              }
            }
          }
        }`,
    };

    const req = this.getRequestWithHeaders(reqBody);

    const response = await fetch(req);
    if (response.ok) {
      let universesJson;
      try {
        universesJson = await response.json();
      } catch (err) {
        console.error(err);
        throw err;
      }

      const universes = universesJson.data.universes.universes;

      this.alchemyUniverses = universes.map((u: any) => ({
        id: u._id,
        name: u.name,
        modules: [],
        userIsCollaborator: u.collaborators
          .map((c: { userId: string }) => c.userId)
          .includes(userId),
      }));
      return null;
    }

    return {
      message: "Failed to load Universes"
    };
  }

  private async loadEditableModules(userId: string): Promise<AlchemySyncPluginError | null> {
    const moduleLoadErrors: string[] = [];
    for (let idx = 0; idx < this.alchemyUniverses.length; idx++) {
      const universe = this.alchemyUniverses[idx]!;
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
          }`,
      };

      const req = this.getRequestWithHeaders(reqBody);
      const response = await fetch(req);

      let universeModules = [];
      if (response.ok) {
        let modulesJson;
        try {
          modulesJson = await response.json();
        } catch (err) {
          console.log(err);
          throw err;
        }
        const modules = modulesJson.data.moduleShelf;

        if (universe.userIsCollaborator) {
          const alchemyModules = modules.map((mod: any) => ({
            id: mod._id,
            name: mod.name,
            articles: this.getModuleArticles(mod.resources),
          }));
          universeModules.push(...alchemyModules);
        } else {
          const userModules = modules
            .filter((mod: { userId: string }) => mod.userId === userId)
            .map((mod: any) => ({
              id: mod._id,
              name: mod.name,
              articles: this.getModuleArticles(mod.resources),
            }));
          universeModules.push(...userModules);
        }
      } else {
        moduleLoadErrors.push(universe.name);
      }

      universe.modules = universeModules;
    }

    if (moduleLoadErrors.length > 0) {
      const err = `
        Failed to load modules for universes:

        ${moduleLoadErrors.join("\n")}
        `;

      return {
        message: err
      };
    }

    return null;
  }

  private getModuleArticles(
    moduleResources: Array<any>,
  ): Array<Partial<AlchemyArticle>> {
    const moduleArticles: Array<Partial<AlchemyArticle>> = [];
    for (
      let resourceIdx = 0;
      resourceIdx < moduleResources.length;
      resourceIdx++
    ) {
      const resource = moduleResources[resourceIdx];
      const resourceParts = resource.split(":");
      const type = resourceParts[1];
      const id = resourceParts[2];
      if (type === "article") {
        moduleArticles.push({
          id,
        });
      }
    }
    return moduleArticles;
  }

  private async loadArticles() {
    const articles = this.alchemyUniverses
      .flatMap((u) => u.modules)
      .flatMap((m) => m.articles);

    const failedArticleIds: string[] = [];
    for (let idx = 0; idx < articles.length; idx++) {
      const article = articles[idx]!;
      const reqBody = {
        operationName: "Article",
        variables: {
          _id: article.id,
        },
        query: `
          query Article($_id: ID!) {
            article(_id: $_id) {
              _id
              title
              body
            }
          }`,
      };

      const req = this.getRequestWithHeaders(reqBody);
      const response = await fetch(req);

      if (response.ok) {
        let articleJson;
        try {
          articleJson = await response.json();
        } catch (err) {
          console.log(err);
          throw err;
        }
        article.title = articleJson.data.article.title;
        article.body = articleJson.data.article.body;
      } else {
        failedArticleIds.push(article.id);
      }
    }

    if (failedArticleIds.length) {
      const err = `
        Failed to load article:

        ${failedArticleIds.join("\n")}
      `;

      return {
        message: err
      };
    }
    return null;
  }

  getRequestWithHeaders(queryBody: {
    operationName: string;
    variables: any | undefined;
    query: string;
  }): Request {
    const headers = new Headers();
    headers.append("content-type", "application/json");
    headers.append("authorization", this.userToken);
    headers.append("accept", "application/json, text/plain, */*");

    return new Request(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(queryBody),
    });
  }
}


