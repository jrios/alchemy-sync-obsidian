export type AlchemyUser = {
	id: string;
	username: string;
};

export type AlchemyUniverse = {
	id: string;
	name: string;
	modules: Array<AlchemyModule>;
	userIsCollaborator: boolean;
};

export type AlchemyModule = {
	id: string;
	name: string;
	articles: Array<AlchemyArticle>;
};

export type AlchemyArticle = {
	id: string;
	title: string;
	body: string;
};
