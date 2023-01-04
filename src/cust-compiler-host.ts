import {existsSync, realpathSync} from 'fs';
import ts, {TextChange} from 'typescript';

/**
 * CompilerHost which loads sources from disk the first time, but performs in memory updates and retrieval.
 * It is also enhanced to make the implementation of @CustLangServiceHost easier by allowing versioned writes (aka updates) of a source file.
 * Thanks to ts-morph, prettier-plugin-organize-imports, and the TypeScript team for helping me finally wrap my head around CompilerHost/LanguageServiceHost
 */
export class CustCompilerHost implements ts.CompilerHost {
	constructor(options: ts.CompilerOptions) {
		this.files = new Map<string, string>();
		this.fileVersions = new Map<string, number>();
		this.sourceFiles = new Map<string, ts.SourceFile>();
	}
	protected files: Map<string, string>;
	protected fileVersions: Map<string, number>;
	protected sourceFiles: Map<string, ts.SourceFile>;

	public getNewLine(): string {
		return ts.sys.newLine;
	}

	public getEnvironmentVariable(name: string): string | undefined {
		return process.env[name];
	}

	public getDefaultLibFileName(options: ts.CompilerOptions): string {
		return ts.getDefaultLibFileName(options);
	}

	public useCaseSensitiveFileNames(): boolean {
		return ts.sys.useCaseSensitiveFileNames;
	}

	public getCanonicalFileName(fileName: string): string {
		if (existsSync(fileName))
			fileName = realpathSync(fileName);
		return this.useCaseSensitiveFileNames() ? fileName : fileName.toLowerCase();
	}

	public getDirectories(path: string): string[] {
		return ts.sys.getDirectories(path);
	}

	public getCurrentDirectory(): string {
		return ts.sys.getCurrentDirectory();
	}

	public fileExists(fileName: string): boolean {
		if (this.files.has(fileName))
			return true;
		return ts.sys.fileExists(fileName);
	}

	public readFile(fileName: string): string | undefined {
		if (this.files.has(fileName))
			return this.files.get(fileName);
		const content = ts.sys.readFile(fileName);
		if (content)
			this.files.set(fileName, content);
		return content;
	}

	public getSourceFile(fileName: string, languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions, onError?: (message: string) => void, shouldCreateNewSourceFile?: boolean): ts.SourceFile | undefined {
		if (this.sourceFiles.has(fileName))
			return this.sourceFiles.get(fileName);
		const text = this.readFile(fileName);
		if (typeof text === 'string') {
			const result = ts.createSourceFile(fileName, text, languageVersionOrOptions);
			this.sourceFiles.set(fileName, result);
			return result;
		}
		return undefined;
	}

	public writeFile(fileName: string, text: string, writeByteOrderMark?: boolean, onError?: ((message: string) => void) | undefined, sourceFiles?: readonly ts.SourceFile[] | undefined, data?: ts.WriteFileCallbackData | undefined): void {
		this.files.set(fileName, text);
		if (this.sourceFiles.has(fileName)) {
			const sf = this.sourceFiles.get(fileName);
			const result = ts.createSourceFile(fileName, text, sf!.languageVersion);
			this.sourceFiles.set(fileName, result);
		}
		const newVers = (this.fileVersions.get(fileName) ?? 1) + 1;
		this.fileVersions.set(fileName, newVers);
	}

	/**
	 * Not a ts.CompilerHost method, but since we implement writeFile,
	 * this allows us to simplify our custom ts.LanguageServiceHost
	 */
	public getScriptVersion(fileName: string): string {
		const v = this.fileVersions.get(fileName);
		// noinspection SuspiciousTypeOfGuard
		if (typeof v === 'number')
			return String(v);
		return '1';
	}

	/**
	 * Helper method to apply text changes to a file and update it
	 */
	public applyTextChanges(fileName: string, textChanges: ReadonlyArray<TextChange>): string {
		let newText = this.readFile(fileName)!;
		textChanges.slice(0).sort((a, b) => b.span.start - a.span.start).forEach((textChange) => {
			const {span} = textChange;
			newText = newText.slice(0, span.start) + textChange.newText + newText.slice(span.start + span.length);
		});
		this.writeFile(fileName, newText);
		return newText;
	}
}
