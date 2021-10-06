import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('ng-copy-structure.copy', (args) => {
		const cse = new CopyStructureExtension(args.path);
		cse.init();
		console.log(args);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }

interface Replace {
	search: string;
	replace: string;
}

enum ReplaceType { fileName = 'FILE NAME', content = 'CONTENT' };

class CopyStructureExtension {

	private dirName: string;

	constructor(private dirPath: string) {
		this.dirName = path.basename(dirPath);
	}

	init() {
		this.buildParams()
			.then((params) => vscode.window.showInformationMessage(JSON.stringify(params, null, '\t')))
			.catch((e) => this.handleError(e));
	}

	private buildParams() {
		const thenable = this.buildNameReplaceParams()
			.then((nameReplaces) => Promise.all([nameReplaces, this.buildContentReplaceParams(nameReplaces[0])]))
			.then(([nameReplaces, contentReplaces]) => ({ nameReplaces, contentReplaces }));
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
				return this.askForReplaceParam([...arr, { search, replace }], type, firstNameReplace);
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

	private nameToContent(name: string) {
		return name.replace(/(^|-)(.)/g, (m, p1, p2) => p2.toLocaleUpperCase());
	}
}
