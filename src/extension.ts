import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as vm from 'vm';

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('ng-copy-structure.copy', (args) => {
		const cse = new CopyStructureExtension(args.path);
		cse.init();
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }

interface Replace {
	search: string;
	replace: string;
}
interface Config {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	multipleReplaces: { 'FILE NAME': boolean; CONTENT: boolean; },
	// eslint-disable-next-line @typescript-eslint/naming-convention
	allReplaces: {
		replaces: { nameReplaces: Replace[], contentReplaces: Replace[] };
		useAllRepalces: boolean;
	};
	replaceFileReplacesInContent: boolean;
	transform: string
}

enum ReplaceType { fileName = 'FILE NAME', content = 'CONTENT' };


class CopyStructureExtension {

	private dirName: string;
	private config: Config;

	constructor(private dirPath: string) {
		this.dirName = path.basename(dirPath);
		this.config = vscode.workspace.getConfiguration(`ngCopyStructure`) as any;
	}

	init() {

		this.buildParams()
			//.then((params) => vscode.window.showInformationMessage(JSON.stringify(params, null, '\t')))
			.then((params) => this.renameAndCopyDir(params, this.dirPath))
			.catch((e) => this.handleError(e));
	}

	private buildParams() {
		if (this.config.allReplaces.useAllRepalces) {
			return Promise.resolve(this.config.allReplaces.replaces);
		}
		const thenable = this.buildNameReplaceParams()
			.then((nameReplaces) => Promise.all([nameReplaces, this.buildContentReplaceParams(nameReplaces[0])]))
			.then(([nameReplaces, contentReplaces]) => ({
				nameReplaces,
				contentReplaces: this.config.replaceFileReplacesInContent ? nameReplaces.concat(contentReplaces) : contentReplaces
			}));
		return Promise.resolve(thenable);
	}

	private buildNameReplaceParams() {
		return this.askForReplaceParam([], ReplaceType.fileName);
	}

	private buildContentReplaceParams(replace: Replace) {
		return this.askForReplaceParam([], ReplaceType.content, replace && replace.replace);
	}

	private askForReplaceParam(arr: Replace[], type: ReplaceType, firstNameReplace?: string) {
		return vscode.window.showInputBox({
			title: `Search (${type})`,
			prompt: `Enter search pattern for ${type} REPLACE. \r\nLeave empty for no${arr.length ? ' more ' : ''} file name replaces`,
			value: arr.length ? '' : this.getDefaultSearchVal(type), // for first display folder name
			ignoreFocusOut: true
		}).then((search) => {
			if (search === undefined) { throw new Error('CANCEL'); }
			if (search === '') { return arr; }

			return vscode.window.showInputBox({
				title: `Replace (${type})`,
				prompt: `Enter replace pattern for ${type} REPLACE.`,
				value: !arr.length && firstNameReplace ? this.getDefaultReplaceVal(firstNameReplace) : '',
				ignoreFocusOut: true
			}).then((replace) => {
				if (replace === undefined) { throw new Error('CANCEL'); }
				if (this.config.multipleReplaces[type]) {
					return this.askForReplaceParam([...arr, { search, replace }], type, firstNameReplace);
				}
				return [...arr, { search, replace }];
			});
		});
	}

	private getDefaultSearchVal(type: ReplaceType): string {
		return type === ReplaceType.fileName ? this.dirName : this.nameToContent(this.dirName);
	}

	private getDefaultReplaceVal(firstNameReplace: string) {
		return this.nameToContent(firstNameReplace);
	}

	private handleError(e) {
		if (e.name === 'CANCEL') { return; }
		vscode.window.showErrorMessage(e.message);
		console.error(e);
	}

	private nameToContent(val: string) {
		const { config: { transform } } = this;
		if (!transform) { return null; }
		var ctx = { result: null, val };
		vm.runInNewContext(`const transform = ${transform}; result = transform(val)`, ctx);
		return ctx.result;
	}

	private replaceAll(replaces: Replace[], text: string) {
		return replaces.reduce((res, curReplace) => res.split(curReplace.search).join(curReplace.replace), text);
	}

	private renameAndCopyFile({ nameReplaces, contentReplaces }, file: string, dir: string) {
		const newFileName = this.replaceAll(nameReplaces, path.basename(file));
		const newFilePath = path.resolve(dir, newFileName);
		const data = fs.readFileSync(file, { encoding: 'utf8' });
		fs.writeFileSync(newFilePath, this.replaceAll(contentReplaces, data), { encoding: 'utf8' });
		console.log(file + '=>\n' + newFilePath);
	}

	private renameAndCopyDir(params, sourceDir: string, destDir?: string) {
		const { nameReplaces } = params;
		destDir = destDir ? this.replaceAll(nameReplaces, destDir) : this.replaceAll(nameReplaces, sourceDir);
		try {
			fs.mkdirSync(destDir);
		} catch (e) {
			if (e.code !== 'EEXIST') {
				throw (e);
			}
		};
		const dirItems = fs.readdirSync(sourceDir);
		return dirItems.map((dirItem) => {
			const resolvedItem = path.resolve(sourceDir, dirItem);
			return (fs.statSync(resolvedItem)).isDirectory() ? this.renameAndCopyDir(params, resolvedItem, path.resolve(destDir, dirItem)) : this.renameAndCopyFile(params, resolvedItem, path.resolve(dirItem, destDir));
		});
	}
}
