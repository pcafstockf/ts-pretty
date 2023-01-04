// noinspection JSUnusedGlobalSymbols

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {randomUUID} from 'crypto';
import {parse as json5Parse} from 'json5';
import cloneDeep from 'lodash/cloneDeep';
import merge from 'lodash/merge';
import ts from 'typescript';
import type {Parser, Printer} from 'prettier';
import {AstPath, Doc, format, ParserOptions, SupportOption} from 'prettier';
import {CustCompilerHost} from './cust-compiler-host';
import {CustLangServiceHost} from './cust-lang-service-host';


export const DefaultFormatCodeSettings: ts.FormatCodeSettings = {
	baseIndentSize: 0,
	newLineCharacter: os.EOL,
	// Space takes up at least twice as much disk space as a tab :-)
	// If you really want to see two 'spaces', use a tab and set indentSize/width to 2 in your editor
	convertTabsToSpaces: false,
	tabSize: 1,
	indentSize: 1,
	indentStyle: ts.IndentStyle.Smart,
	trimTrailingWhitespace: true,
	insertSpaceAfterCommaDelimiter: true,
	insertSpaceAfterSemicolonInForStatements: true,
	insertSpaceBeforeAndAfterBinaryOperators: true,
	insertSpaceAfterConstructor: true,
	insertSpaceAfterKeywordsInControlFlowStatements: true,
	insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
	insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
	insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
	insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
	insertSpaceAfterTypeAssertion: true,
	insertSpaceBeforeFunctionParenthesis: false,
	placeOpenBraceOnNewLineForFunctions: false,
	placeOpenBraceOnNewLineForControlBlocks: false,
	insertSpaceBeforeTypeAnnotation: false,
	indentMultiLineObjectLiteralBeginningOnBlankLine: true,
	semicolons: ts.SemicolonPreference.Insert
};

interface TscNode {
	type: 'tsc-ast';
	body: string;
	source: string;
	start: number;
	end: number;
}

export const defaultOptions = {
	tsbDisable: false,
	tsbUseBuiltins: false,
	tsOptimizeImports: false
};


export interface PluginOptions {
	tsbDisable?: boolean;
	tsbUseBuiltins?: boolean;
	tsbTsconfig?: string;
	tsbTsFormat?: string;
	tsbOptimizeImports?: boolean;
}

export const options: Record<keyof PluginOptions, SupportOption> = {
	tsbDisable: {
		type: 'boolean',
		category: 'TypeScript',
		since: '1.16.4',
		default: false,
		description: 'ts-pretty will not modify source code',
	},
	tsbUseBuiltins: {
		type: 'boolean',
		category: 'TypeScript',
		since: '1.16.4',
		default: false,
		description: 'If true, the builtin parser output will be piped into ts-pretty.',
	},
	tsbTsconfig: {
		type: 'path',
		category: 'TypeScript',
		since: '1.16.4',
		description: 'Specify location of a tsconfig.json file (defaults to process.env.TS_NODE_PROJECT if present)',
	},
	tsbTsFormat: {
		type: 'path',
		category: 'TypeScript',
		since: '1.16.4',
		description: 'Json5 file containing ts.FormatCodeSettings overrides',
	},
	tsbOptimizeImports: {
		type: 'boolean',
		category: 'TypeScript',
		since: '1.16.4',
		default: false,
		description: 'Optimize TypeScript imports',
	},
};

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

class TypeScriptParser {
	readonly astFormat = 'tsc-ast';

	constructor() {
	}
	formatOverrides?: ts.FormatCodeSettings;

	protected makeFormatCodeSettings(options: ParserOptions<TscNode> & PluginOptions): ts.FormatCodeSettings {
		const format = cloneDeep(DefaultFormatCodeSettings) as Writeable<ts.FormatCodeSettings>;
		switch (options.endOfLine) {
			case 'crlf':
				format.newLineCharacter = '\r\n';
				break;
			case 'lf':
				format.newLineCharacter = '\n';
				break;
			case 'cr':
				format.newLineCharacter = '\r';
				break;
			case 'auto':
			default:
				delete format.newLineCharacter;
				break;
		}
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.semi === 'boolean')
			format.semicolons = !options.semi ? ts.SemicolonPreference.Remove : ts.SemicolonPreference.Insert;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.tabWidth === 'number')
			format.indentSize = format.tabSize = options.tabWidth;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.useTabs === 'boolean') {
			format.convertTabsToSpaces = !options.useTabs;
			if (format.convertTabsToSpaces)
				// noinspection SuspiciousTypeOfGuard
				if (typeof options.tabWidth === 'number')
					format.indentSize = format.tabSize = 1; // ts always uses a single tab (it's up to the editor to display the tab as x number of spaces).
		}
		else
			delete format.convertTabsToSpaces;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.bracketSpacing === 'boolean')
			format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets = options.bracketSpacing;

		if (options.tsbTsFormat) {
			if (!this.formatOverrides) {
				const txt = fs.readFileSync(options.tsbTsFormat, 'utf8');
				this.formatOverrides = json5Parse(txt);
			}
			merge(format, this.formatOverrides);
		}
		return format;
	}

	/**
	 * THIS METHOD IS A HACK!
	 * I would really like to find a better way!
	 * The ts.Printer builtin to TypeScript does *mostly* what we want, but there is an existing (and realistic)
	 * prettier expectation, that users can specify single vs double quote transformations.
	 * But bottom line is that ts.Printer simply does not support that.
	 * Worse, the hack we do use is not "public".  Hence, we isolate it into this one method.
	 * StringLiterals have an internal property called 'singleQuote'.
	 * Unfortunately, the Printer also has "optimizations" where it re-uses the text of the source file whenever it can.
	 * This "optimization" prevents us from converting quotes in some cases (mostly in import statements).
	 * So...
	 * We set the flag on all StringLiteral nodes in the source file, *and* patch ts.getLiteralText to ignore the sourceFile text *when* getting the text for a StringLiteral.
	 * This results in StringLiterals being printed from the StringLiteral node itself rather than from the actual SourceFile text.
	 */
	protected tsPrintSourceFile(sourceFile: ts.SourceFile, options: ParserOptions<TscNode> & PluginOptions) {
		const printer = ts.createPrinter();
		let singleQuote: boolean | undefined;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.singleQuote === 'boolean')
			singleQuote = options.singleQuote;
		else if (options.singleQuote === null || options.singleQuote === '0' || options.singleQuote === 0)
			singleQuote = false;
		else {
			// noinspection SuspiciousTypeOfGuard
			if (typeof options.singleQuote === 'string') {
				const s = (options.singleQuote as string).toLowerCase();
				if (s === 'false' || s === 'null' || s === 'no')
					singleQuote = false;
				else if (options.singleQuote)
					singleQuote = true;
			}
			else if (options.singleQuote)
				singleQuote = true;
		}

		function visitNode(node: ts.Node) {
			switch (node.kind) {
				case ts.SyntaxKind.StringLiteral:
					(node as any).singleQuote = singleQuote;
					break;
				default:
					break;
			}
			ts.forEachChild(node, visitNode);
		}

		if (typeof singleQuote === 'boolean')
			visitNode(sourceFile as ts.Node);
		const getLiteralTextWrapper = (ts as any).getLiteralText;
		(ts as any).getLiteralText = function getLiteralText(node: ts.Node, sourceFile: ts.SourceFile, flags: number) {
			if (node.kind === ts.SyntaxKind.StringLiteral)
				return getLiteralTextWrapper(node, null, flags);
			return getLiteralTextWrapper(node, sourceFile, flags);
		};
		try {
			return printer.printNode(ts.EmitHint.SourceFile, sourceFile!, sourceFile!);
		}
		finally {
			(ts as any).getLiteralText = getLiteralTextWrapper;
		}
	}

	parse(text: string, options: ParserOptions<TscNode> & PluginOptions): TscNode {
		// Remember, each file can potentially have different options.
		const formatOpts = this.makeFormatCodeSettings(options);

		let searchDir = './';
		let tsConfigName = undefined;
		if (process.env.TS_NODE_PROJECT) {
			searchDir = path.dirname(process.env.TS_NODE_PROJECT);
			tsConfigName = path.basename(process.env.TS_NODE_PROJECT);
		}
		if (options.tsbTsconfig) {
			searchDir = path.dirname(options.tsbTsconfig);
			tsConfigName = path.basename(options.tsbTsconfig);
		}
		const tsConfig = ts.findConfigFile(
			searchDir,
			ts.sys.fileExists,
			tsConfigName
		);
		const configFile = ts.readConfigFile(tsConfig!, ts.sys.readFile);
		const configOptions = ts.parseJsonConfigFileContent(
			configFile.config,
			ts.sys,
			path.dirname(tsConfig!)
		);
		const host = new CustCompilerHost(configOptions.options);
		let filePath = options.filepath;
		if (filePath) {
			if (fs.existsSync(filePath))
				filePath = host.getCanonicalFileName(filePath);
		}
		else
			filePath = path.join(configOptions.options.baseUrl ?? './', randomUUID() + '.ts');
		host.writeFile(filePath, text);
		const languageService = ts.createLanguageService(new CustLangServiceHost(host, ts.createProgram([filePath], configOptions.options, host)));
		let sourceFile = host.getSourceFile(filePath, configOptions.options.target ?? ts.ScriptTarget.Latest);
		let cleanedText = this.tsPrintSourceFile(sourceFile!, options);
		host.writeFile(filePath, cleanedText);
		if (options.tsbOptimizeImports) {
			if ((!cleanedText.includes('// organize-imports-ignore')) && (!cleanedText.includes('// tslint:disable:ordered-imports'))) {
				const fileChanges = languageService.organizeImports({fileName: filePath, type: 'file', mode: ts.OrganizeImportsMode.All}, formatOpts, {});
				fileChanges.forEach(v => host.applyTextChanges(v.fileName, v.textChanges));
			}
		}
		const textChanges = languageService.getFormattingEditsForDocument(filePath, formatOpts);
		const finalText = host.applyTextChanges(filePath, textChanges);
		return {
			type: 'tsc-ast',
			source: text,
			start: 0,
			end: text.length,
			body: finalText
		};
	}

	locStart(node: TscNode): number {
		return node.start;
	}

	locEnd(node: TscNode): number {
		return node.end;
	}
}


class TypeScriptPrinter {
	constructor() {
	}

	/**
	 * @param path  An object, which can be used to access nodes in the AST. It’s a stack-like data structure that maintains the current state of the recursion.
	 *              It is called “path” because it represents the path to the current node from the root of the AST.
	 *              The current node is returned by path.getValue().
	 * @param options   A persistent object, which contains global options and which a plugin may mutate to store contextual data.
	 */
	print(path: AstPath<TscNode>, options: ParserOptions<TscNode>): Doc {
		const node = path.getValue();
		switch (node.type) {
			case 'tsc-ast':
				return node.body;
			default:
				console.error('Unknown tsc node:', node);
				return node.source;
		}
	}
}


export const printers: Record<string, Printer<TscNode>> = {
	'tsc-ast': new TypeScriptPrinter()
};

export const languages = [
	{
		name: 'TypeScript',
		type: 'programming',
		group: 'TypeScript',
		tmScope: 'source.ts',
		aceMode: 'typescript',
		codemirrorMode: 'javascript',
		codemirrorMimeType: 'application/typescript',
		extensions: ['.ts', '.mts', '.cts'],
		aliases: ['ts'],
		linguistLanguageId: 378,
		vscodeLanguageIds: ['typescript'],
		parsers: ['ts-pretty', 'typescript', 'babel-ts']
	},
	{
		name: 'TSX',
		type: 'programming',
		group: 'TypeScript',
		tmScope: 'source.ts.tsx',
		aceMode: 'typescript',
		codemirrorMode: 'tsx',
		codemirrorMimeType: 'text/tsx',
		extensions: ['.tsx'],
		linguistLanguageId: 378,
		vscodeLanguageIds: ['typescriptreact'],
		parsers: ['typescript', 'babel-ts'],
	},
	{
		name: 'JavaScript',
		type: 'programming',
		group: 'JavaScript',
		tmScope: 'source.js',
		aceMode: 'javascript',
		codemirrorMode: 'javascript',
		codemirrorMimeType: 'text/javascript',
		extensions: ['.js', '.cjs', '.mjs'],
		aliases: ['js', 'node'],
		interpreters: ['node', 'nodejs'],
		linguistLanguageId: 183,
		vscodeLanguageIds: ['javascript'],
		parsers: ['espree', 'babel', 'meriyah', 'acorn'],
	},
	{
		name: 'JSX',
		type: 'programming',
		group: 'JavaScript',
		tmScope: 'source.js.jsx',
		aceMode: 'javascript',
		codemirrorMode: 'jsx',
		codemirrorMimeType: 'text/jsx',
		extensions: ['.jsx'],
		linguistLanguageId: 178,
		vscodeLanguageIds: ['javascriptreact'],
		parsers: ['babel', 'espree'],
	},
];
const knownParsers = new Set<string>(languages.map(l => l.parsers).flat(10));

const {parsers: babelParsers} = require('prettier/parser-babel');
const builtIns = {
	parsers: {
		'builtin-espree': {
			...require('prettier/parser-espree').parsers.espree
		},
		'builtin-meriyah': {
			...require('prettier/parser-meriyah').parsers.meriyah
		},
		'builtin-typescript': {
			...require('prettier/parser-typescript').parsers.typescript
		},
		'builtin-babel': {
			...babelParsers.babel
		},
		'builtin-babel-ts': {
			...babelParsers['babel-ts']
		}
	}
};

const parserInstance = new TypeScriptParser();
export const parsers = Array.from(knownParsers).reduce((parsers, parserName) => {
	parsers[parserName] = {
		locStart(node: TscNode): number {
			return parserInstance.locStart(node);
		},
		locEnd(node: TscNode): number {
			return parserInstance.locEnd(node);
		},
		parse(text: string, parsersInPrettierV2OrOptionsInPrettierV3: { [_: string]: Parser } | ParserOptions<TscNode>, optionsInPrettierV2AndV3?: ParserOptions<TscNode>): TscNode {
			let options: ParserOptions<TscNode> & PluginOptions;
			if (typeof (parsersInPrettierV2OrOptionsInPrettierV3 as any)[parserName] === 'function')
				options = optionsInPrettierV2AndV3 as any;
			else
				options = parsersInPrettierV2OrOptionsInPrettierV3 as any;
			const origTxt = text;
			if (options.tsbUseBuiltins) {
				text = format(origTxt, {
					...options,
					parser: 'builtin-' + parserName,
					plugins: [builtIns],
				});
			}
			if (options.tsbDisable) {
				return {
					type: 'tsc-ast',
					source: origTxt,
					start: 0,
					end: origTxt.length,
					body: text
				};
			}
			return parserInstance.parse(text, options);
		},
		astFormat: 'tsc-ast'
	};
	return parsers;
}, {} as Record<string, Parser<TscNode>>);
