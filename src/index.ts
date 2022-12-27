// noinspection JSUnusedGlobalSymbols

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {cloneDeep as lodashCloneDeep, merge as lodashMerge} from 'lodash';
import {parse as json5Parse} from 'json5';
import type {Parser, Printer} from 'prettier';
import {AstPath, Doc, format, ParserOptions, SupportOption} from 'prettier';
import {ts, Project, FormatCodeSettings, QuoteKind, IndentationText, SourceFile} from 'ts-morph';
import {IndentStyle, NewLineKind, SemicolonPreference} from 'typescript';

export const DefaultFormatCodeSettings: FormatCodeSettings = {
	baseIndentSize: 0,
	newLineCharacter: '\n',
	// Space takes up at least twice as much disk space as a tab :-)
	// If you really want to see two 'spaces', use a tab and set indentSize to 2 in your editor
	convertTabsToSpaces: false,
	tabSize: 4,
	indentSize: 4,
	indentStyle: IndentStyle.Smart,
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
	semicolons: SemicolonPreference.Insert,
	ensureNewLineAtEndOfFile: true,
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
	// project?: Project;
	tmpDir?: string;
	formatOverrides?: FormatCodeSettings;

	protected makeFormatCodeSettings(options: ParserOptions<TscNode> & PluginOptions): FormatCodeSettings {
		const format = lodashCloneDeep(DefaultFormatCodeSettings) as Writeable<FormatCodeSettings>;
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
			format.semicolons = !options.semi ? SemicolonPreference.Remove : SemicolonPreference.Insert;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.tabWidth === 'number')
			format.tabSize = options.tabWidth;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.useTabs === 'boolean')
			format.convertTabsToSpaces = !options.useTabs;
		else
			delete format.convertTabsToSpaces;
		// noinspection SuspiciousTypeOfGuard
		if (typeof options.bracketSpacing === 'boolean')
			format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets =  options.bracketSpacing;

		if (options.tsbTsFormat) {
			if (! this.formatOverrides) {
				const txt = fs.readFileSync(options.tsbTsFormat, 'utf8');
				this.formatOverrides = json5Parse(txt);
			}
			lodashMerge(format, this.formatOverrides);
		}
		return format;
	}

	parse(text: string, options: ParserOptions<TscNode> & PluginOptions): TscNode {
		// Remember, each file can potentially have different options.
		const formatOpts = this.makeFormatCodeSettings(options);
		// if (!this.project) {
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
			let indentationText = IndentationText.Tab;
			if (formatOpts.convertTabsToSpaces)
				switch (formatOpts.tabSize) {
					case 2:
						indentationText = IndentationText.TwoSpaces;
						break;
					case 4:
						indentationText = IndentationText.FourSpaces;
						break;
					case 8:
						indentationText = IndentationText.EightSpaces;
						break;
					default:
						break;
				}
			// noinspection SuspiciousTypeOfGuard
			const project = new Project({
				tsConfigFilePath: tsConfig,
				skipAddingFilesFromTsConfig: true,
				manipulationSettings: {
					quoteKind: typeof options.singleQuote === 'boolean' ? options.singleQuote ? QuoteKind.Single : QuoteKind.Double : QuoteKind.Single,
					newLineKind: formatOpts.newLineCharacter === '\n' ? NewLineKind.LineFeed : formatOpts.newLineCharacter === '\r\n' ? NewLineKind.CarriageReturnLineFeed : undefined,
					indentationText: indentationText,
					useTrailingCommas: options.trailingComma !== 'none'
				}
			});
		// }
		// I kind of think we will always have a filepath set in the real world, but we do not during testing, and I guess it's possible in other scenarios if the prettier API is being invoked programmatically.
		let filePath = options.filepath;
		if (! filePath) {
			// Hash the input to a name.  In truth, this probably doesn't matter since even if we had a name collision, we will update the content anyway.
			let h = 0;
			for(let i = 0; i < text.length; i++)
				h = Math.imul(31, h) + text.charCodeAt(i) | 0;
			if (! this.tmpDir)
				this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-pretty-'), 'utf8');
			filePath = path.join(this.tmpDir, String(h) + '.ts');
			if (! fs.existsSync(filePath))
				fs.writeFileSync(filePath, text, 'utf8');
		}
		let sf = project.getSourceFile(filePath);
		if (!sf)
			sf = project.addSourceFileAtPath(filePath);
		if (options.tsbUseBuiltins)
			sf = sf.replaceWithText(text) as SourceFile;
		// print is what cleans up the quoting, braces, etc.
		sf = sf.replaceWithText(sf.print()) as SourceFile;
		if (options.tsbOptimizeImports)
			sf = sf.organizeImports(formatOpts);
		// apply the formatting that will be used by getFullText
		sf.formatText(formatOpts);
		return {
			type: 'tsc-ast',
			source: text,
			start: 0,
			end: text.length,
			body: sf.getFullText()
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
		name: 'Flow',
		type: 'programming',
		group: 'JavaScript',
		tmScope: 'source.js',
		aceMode: 'javascript',
		codemirrorMode: 'javascript',
		codemirrorMimeType: 'text/javascript',
		extensions: ['.js.flow'],
		aliases: [],
		interpreters: ['node'],
		linguistLanguageId: 183,
		vscodeLanguageIds: ['javascript'],
		parsers: ['babel', 'flow', 'babel-flow']
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
		parsers: ['babel', 'flow', 'espree', 'babel-flow'],
	},
];
const knownParsers = new Set<string>(languages.map(l => l.parsers).flat(10));

const { parsers: babelParsers } = require('prettier/parser-babel');
const builtIns = {
	parsers: {
		'builtin-espree': {
			...require('prettier/parser-espree').parsers.espree
		},
		'builtin-meriyah': {
			...require('prettier/parser-meriyah').parsers.meriyah
		},
		'builtin-flow': {
			...require('prettier/parser-flow').parsers.flow
		},
		'builtin-typescript': {
			...require('prettier/parser-typescript').parsers.typescript
		},
		'builtin-babel': {
			...babelParsers.babel
		},
		'builtin-babel-flow': {
			...babelParsers['babel-flow']
		},
		'builtin-babel-ts': {
			...babelParsers['babel-ts']
		}
	}
}

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
	}
	return parsers;
}, {} as Record<string, Parser<TscNode>>);
