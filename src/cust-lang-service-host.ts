import ts from 'typescript';
import {CustCompilerHost} from './cust-compiler-host';

/**
 * Delegates all functionality to either ts.Program or ts.CompilerHost (aka @see CustCompilerHost).
 */
export class CustLangServiceHost implements ts.LanguageServiceHost {
	constructor(protected compilerHost: CustCompilerHost, protected program: ts.Program) {
	}

	public getCompilationSettings(): ts.CompilerOptions {
		return this.program.getCompilerOptions();
	}

	public getCurrentDirectory(): string {
		return this.program.getCurrentDirectory();
	}

	public getDefaultLibFileName(options: ts.CompilerOptions): string {
		return this.compilerHost.getDefaultLibFileName(options);
	}

	public getScriptFileNames(): string[] {
		return this.program.getSourceFiles().map((sf) => sf.fileName);
	}


	public fileExists(fileName: string): boolean {
		return this.compilerHost.fileExists(fileName);
	}

	public readFile(fileName: string, encoding?: string): string | undefined {
		return this.compilerHost.readFile(fileName);
	}

	public getScriptVersion(fileName: string): string {
		return this.compilerHost.getScriptVersion(fileName);
	}

	public getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
		const text = this.readFile(fileName);
		if (typeof text === 'string')
			return ts.ScriptSnapshot.fromString(text);
		return undefined;
	}
}
