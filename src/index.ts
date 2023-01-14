// noinspection JSUnusedGlobalSymbols

import {randomUUID} from 'crypto';
import * as fs from 'fs';
import {parse as json5Parse} from 'json5';
import cloneDeep from 'lodash/cloneDeep';
import merge from 'lodash/merge';
import * as os from 'os';
import * as path from 'path';
import type {Parser, Printer} from 'prettier';
import {AstPath, Doc, format, ParserOptions, SupportOption} from 'prettier';
import ts from 'typescript';
import {CustCompilerHost} from './cust-compiler-host';
import {CustLangServiceHost} from './cust-lang-service-host';


/**
 * Declare a fallback set of formatting options that are appealing to me personally :-)
 */
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

/**
 * These are the "enhanced" options this plugin supports.
 * NOTE:
 *  There is some intersection between @see TspPluginOptions, @see options, and @see defaultOptions that MUST be *manually* maintained.
 *  It's not very elegant, but not sure how else to manage it.
 */
export interface TspPluginOptions {
	/**
	 * Whether to perform ts-pretty transformations.
	 * Keep this property name and comment aligned with @see options.tspDisable.description
	 */
	tspDisable?: boolean;
	/**
	 * Invoke previously loaded parser and use its output as input to ts-pretty.
	 * Keep this property name and comment aligned with @see options.tspUseBuiltins.description
	 */
	tspUseBuiltins?: boolean;
	/**
	 * Filepath to a tsconfig.json file.
	 *  If not defined, defaults to process.env.TS_NODE_PROJECT,
	 *  otherwise ./tsconfig.json (if present but you want to ignore it, pass "ignore"),
	 *  otherwise a hardcoded set of tsconfig options.
	 * Keep this property name and comment aligned with @see options.tspTsConfig.description
	 */
	tspTsConfig?: string | null;
	/**
	 * json5 file containing ts.FormatCodeSettings overrides.
	 * Keep this property name and comment aligned with @see options.tspTsFormat.description
	 */
	tspTsFormat?: string;
	/**
	 * Organize TypeScript imports using ts.LanguageService.organizeImports
	 * Keep this property name and comment aligned with @see options.tspOrganizeImports.description
	 */
	tspOrganizeImports?: boolean;
}

/**
 * These are the *types* of the "enhanced" options this plugin supports.
 * NOTE:
 *  There is some intersection between @see TspPluginOptions, @see options, and @see defaultOptions that MUST be *manually* maintained.
 *  It's not very elegant, but not sure how else to manage it.
 */
export const options: Record<keyof TspPluginOptions, SupportOption> = {
	tspDisable: {
		type: 'boolean',    // keep this in sync with the type of @see TspPluginOptions.tspDisable
		category: 'TypeScript',
		since: '1.16.4',
		default: false,    // keep this in sync with the value of @see defaultOptions.tspDisable
		description: 'Whether to perform ts-pretty transformations.',
	},
	tspUseBuiltins: {
		type: 'boolean',    // keep this in sync with the type of @see TspPluginOptions.tspUseBuiltins
		category: 'TypeScript',
		since: '1.16.4',
		default: false,    // keep this in sync with the value of @see defaultOptions.tspUseBuiltins
		description: 'Invoke previously loaded parser and use its output as input to ts-pretty.',
	},
	tspTsConfig: {
		type: 'path',    // keep this in sync with the type of @see TspPluginOptions.tspTsConfig (e.g. 'path' is filepath is string).
		category: 'TypeScript',
		since: '1.16.4',
		// default value is undefined in keeping with @see defaultOptions.tspTsFormat
		description: 'Filepath to a tsconfig.json file.\n\tIf not defined, defaults to process.env.TS_NODE_PROJECT,\n\totherwise ./tsconfig.json (if present but you want to ignore it, pass "ignore"),\n\totherwise a hardcoded set of tsconfig options.'
	},
	tspTsFormat: {
		type: 'path',    // keep this in sync with the type of @see TspPluginOptions.tspTsFormat (e.g. 'path' is filepath is string).
		category: 'TypeScript',
		since: '1.16.4',
		// default value is undefined in keeping with @see defaultOptions.tspTsFormat
		description: 'json5 file containing ts.FormatCodeSettings overrides',
	},
	tspOrganizeImports: {
		type: 'boolean',    // keep this in sync with the type of @see TspPluginOptions.tspOrganizeImports
		category: 'TypeScript',
		since: '1.16.4',
		default: false,    // keep this in sync with the value of @see defaultOptions.tspOrganizeImports
		description: 'Organize TypeScript imports using ts.LanguageService.organizeImports',
	},
};

/**
 * These are the default values for the "enhanced" options this plugin supports.
 * NOTE:
 *  There is some intersection between @see TspPluginOptions, @see options, and @see defaultOptions that MUST be *manually* maintained.
 *  It's not very elegant, but not sure how else to manage it.
 */
export const defaultOptions = {
	tspDisable: false,      // keep this in sync with the type of @see options.tspDisable
	tspUseBuiltins: false,      // keep this in sync with the type of @see options.tspUseBuiltins
	tspOrganizeImports: false      // keep this in sync with the type of @see options.tspOrganizeImports
	// Other supported options default to undefined.
};

/**
 * An unofficial TypeScript utility type that is the inverse of ReadOnly.
 */
type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Our prettier ast is simply a single node for the entire source file.
 */
interface TscNode {
	type: 'tsc-ast';
	body: string;
	source: string;
	start: number;
	end: number;
}

/**
 * This is the parser we use for all our 'supported' parser names (e.g. typescript, acorn, babel, etc.).
 */
class TypeScriptParser {
	/**
	 * The type of nodes returned by this parser.
	 * @see TscNode
	 */
	readonly astFormat = 'tsc-ast';

	constructor() {
	}

	formatOverrides?: ts.FormatCodeSettings;

	/**
	 * Merge together a final ts.FormatCodeSettings for configuring the whitespace of a file.
	 * Starts with my own preferred defaults (@see DefaultFormatCodeSettings),
	 * then merge in prettier specific options,
	 * and finally override with anything found in a ts-format.json (e.g. --tspTsFormat) file (if one was specified).
	 */
	protected makeFormatCodeSettings(options: ParserOptions<TscNode> & TspPluginOptions): ts.FormatCodeSettings {
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

		if (options.tspTsFormat) {
			if (!this.formatOverrides) {
				const txt = fs.readFileSync(options.tspTsFormat, 'utf8');
				this.formatOverrides = json5Parse(txt);
			}
			merge(format, this.formatOverrides);
		}
		return format;
	}

	/**
	 * THIS METHOD IS A HACK!  I would really like to find a better way!
	 * The ts.Printer builtin to TypeScript does *mostly* what we want but hardcodes the use of single vs double quotes.
	 * There is an existing (and realistic) prettier expectation, that users can specify single vs double quote transformations.
	 * But the bottom line is that ts.Printer simply does not support that.
	 * Worse, the hack we use below is *not* "public".  Hence, we isolate it into this one method.
	 * StringLiterals have an internal property called 'singleQuote'.
	 * Unfortunately, the ts.Printer also has "optimizations" where it re-uses the text of the source file whenever it can, meaning it will keep whatever type of quote was already in the source file.
	 * This *prevents* us from converting quotes (mostly in import statements).
	 * So...
	 * We set the flag on all StringLiteral nodes in the source file, *and* patch ts.getLiteralText (an exposed but undocumented global) to ignore the sourceFile text *when* getting the text for a StringLiteral.
	 * This results in StringLiterals being printed from the StringLiteral node itself rather than from the actual SourceFile text (see the ts.Printer optimization comment above).
	 * Bottom line...
	 * This method traverses the TypeScript ast nodes and patches up (as best it can) the StringLiteral nodes to have the "right" boolean value set for StringLiteral.singleQuote.
	 * This method also temporarily patches the ts.getLiteralText global (mentioned above) while ts.Printer renders the tree.
	 * Net result is we end up with the ability to control single vs double quotes in the source code.
	 */
	protected tsPrintSourceFile(sourceFile: ts.SourceFile, options: ParserOptions<TscNode> & TspPluginOptions) {
		const printer = ts.createPrinter();

		function visitNode(node: ts.Node) {
			switch (node.kind) {
				case ts.SyntaxKind.StringLiteral:
					(node as any).singleQuote = options.singleQuote;
					break;
				default:
					break;
			}
			ts.forEachChild(node, visitNode);
		}

		// Patch up the tree
		if (options.singleQuote)
			visitNode(sourceFile as ts.Node);
		// Temporarily patch the printing of StringLiteral nodes
		const getLiteralTextWrapper = (ts as any).getLiteralText;
		(ts as any).getLiteralText = function getLiteralText(node: ts.Node, sourceFile: ts.SourceFile, flags: number) {
			if (node.kind === ts.SyntaxKind.StringLiteral)
				return getLiteralTextWrapper(node, null, flags) as string;
			return getLiteralTextWrapper(node, sourceFile, flags) as string;
		};
		// Print the ast of the source file, ensuring we restore/remove the StringLiteral patch when we are done.
		try {
			return printer.printNode(ts.EmitHint.SourceFile, sourceFile, sourceFile);
		}
		finally {
			(ts as any).getLiteralText = getLiteralTextWrapper;
		}
	}

	/**
	 * @inheritDoc
	 * This is the core method of every prettier plugin parser.
	 * NOTE:
	 *  If the --tspUseBuiltins options was set, the 'text' provided to this parse method will be the output from the previously registered plugin.
	 */
	parse(text: string, options: ParserOptions<TscNode> & TspPluginOptions): TscNode {
		// Remember, each file can potentially have different options.
		const formatOpts = this.makeFormatCodeSettings(options);

		let tsConfigPath: string | undefined | null = null;
		// Find a tsconfig.json file to load compiler options from (if possible).
		if (options.tspTsConfig !== 'ignore') {
			let searchDir = './';
			let tsConfigName;
			if (process.env.TS_NODE_PROJECT) {
				searchDir = path.dirname(process.env.TS_NODE_PROJECT);
				tsConfigName = path.basename(process.env.TS_NODE_PROJECT);
			}
			if (options.tspTsConfig) {
				searchDir = path.dirname(options.tspTsConfig);
				tsConfigName = path.basename(options.tspTsConfig);
			}
			tsConfigPath = ts.findConfigFile(
				searchDir,
				ts.sys.fileExists,
				tsConfigName
			);
		}
		let tsCompilerOptions: ts.CompilerOptions;
		if (tsConfigPath) {
			const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
			const configOptions = ts.parseJsonConfigFileContent(
				configFile.config,
				ts.sys,
				path.dirname(tsConfigPath)
			);
			tsCompilerOptions = configOptions.options;
		}
		else {
			// We could not find a tsconfig.json file, so this is likely not a typescript project, and keep in mind we are not emitting/compiling anyway!
			// So, use these defaults were taken from a combination of tsc --init and my own speculation about what would be useful for supporting a wide variety of *javascript* code.
			tsCompilerOptions = {
				// Set the JavaScript language version for emitted JavaScript and include compatible library declarations.
				'target': ts.ScriptTarget.ESNext,
				// Specify what JSX code is generated
				'jsx': ts.JsxEmit.Preserve,
				// Enable experimental support for TC39 stage 2 draft decorators.
				'experimentalDecorators': true,
				// Control what method is used to detect module-format JS files.
				'moduleDetection': ts.ModuleDetectionKind.Auto,
				// Specify what module code is generated.
				'module': ts.ModuleKind.CommonJS,
				// Specify how TypeScript looks up a file from a given module specifier.
				'moduleResolution': ts.ModuleResolutionKind.NodeJs,
				// Enable importing .json files.
				'resolveJsonModule': true,
				// Allow JavaScript files to be a part of your program.
				'allowJs': true,
				// disable emitting files from a compilation.
				'noEmit': true,
				// Emit additional JavaScript to ease support for importing CommonJS modules.
				'esModuleInterop': true,
				// Disable resolving symlinks to their realpath. This correlates to the same flag in node.
				'preserveSymlinks': true,
				// Ensure that casing is correct in imports.
				'forceConsistentCasingInFileNames': true,
				// Enable all strict type-checking options.
				'strict': false,
				// Skip type checking all .d.ts files.
				'skipLibCheck': true
			} as ts.CompilerOptions;
		}
		// Remember, ts.CompilerHost is what the TypeScriptCompiler API uses as an adapter to read and write the native file system.
		const host = new CustCompilerHost();
		let filePath = options.filepath;
		// Normally we have a file to format, but if we are called programatically (via prettier.format like we do in testing), there will not be a file.
		if (filePath) {
			if (fs.existsSync(filePath))
				filePath = host.getCanonicalFileName(filePath);
		}
		else {
			// No file path, but the compiler needs one, so make one up.
			// Our ts.CompilerHost reads from disk, but always writes to memory, so it does not matter that the file is non-existant.
			filePath = path.join(tsCompilerOptions.baseUrl ?? './', randomUUID() + '.ts');
		}
		host.writeFile(filePath, text);
		// Our ts.LanguageServiceHost just delegates to the ts.Program and ts.CompilerHost we create, so all this is still happening in memory only.
		const languageService = ts.createLanguageService(new CustLangServiceHost(host, ts.createProgram([filePath], tsCompilerOptions, host)));
		// Get the "source" file that we just "wrote" (host.writeFile) above.
		const sourceFile = host.getSourceFile(filePath, tsCompilerOptions.target ?? ts.ScriptTarget.Latest);
		// Use our specialized method to invoke ts.Printer.printNode.
		const cleanedText = this.tsPrintSourceFile(sourceFile!, options);
		// Write a cleaned up file (sans import optimizations and whitespace cleanup) (again all to memory).
		host.writeFile(filePath, cleanedText);
		if (options.tspOrganizeImports) {
			// This little bypass inspired by the prettier-plugin-organize-imports project.
			if ((!cleanedText.includes('// organize-imports-ignore')) && (!cleanedText.includes('// tslint:disable:ordered-imports'))) {
				const fileChanges = languageService.organizeImports({fileName: filePath, type: 'file', mode: ts.OrganizeImportsMode.All}, formatOpts, {});
				fileChanges.forEach(v => host.applyTextChanges(v.fileName, v.textChanges));
			}
		}
		// Apply user requested whitespace formatting.
		const textChanges = languageService.getFormattingEditsForDocument(filePath, formatOpts);
		const finalText = host.applyTextChanges(filePath, textChanges);
		// Return the formatted text "file" as a cleaned up single ast node.
		return {
			type: 'tsc-ast',
			source: text,
			start: 0,
			end: text.length,
			body: finalText
		};
	}

	/* istanbul ignore next */
	locStart(node: TscNode): number {
		return node.start;
	}
	/* istanbul ignore next */
	locEnd(node: TscNode): number {
		return node.end;
	}
}

/**
 * *The* ts-pretty parser.
 */
const parserInstance = new TypeScriptParser();

/**
 * Part of the prettier plugin API, we export these 'languages' collected from many samples across the internet
 * which hopefully accurately represent the TypeScript/JavaScript languages that the TypeScript Compiler API can handle.
 */
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
// Make a unique set of all the 'standard' prettier parser names we think we can replace.
const knownParsers = new Set<string>(languages.map(l => l.parsers).flat(10));
// Rename the builtin parsers so we can replace them, but still have a reference to them when a caller asks for --tspUseBuiltins
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

/**
 * Part of the prettier plugin API, actually build wrapper parsers (one for each of the @see languages we support).
 * The wrapper handles invoking the previously registered parser for a language (if so requested), and then
 * optionally invokes the actual ts-pretty parser to do it's thing.
 */
export const parsers = Array.from(knownParsers).reduce((parsers, parserName) => {
	parsers[parserName] = {
		/* istanbul ignore next */
		locStart(node: TscNode): number {
			return parserInstance.locStart(node);
		},
		/* istanbul ignore next */
		locEnd(node: TscNode): number {
			return parserInstance.locEnd(node);
		},
		parse(text: string, parsersInPrettierV2OrOptionsInPrettierV3: { [_: string]: Parser } | ParserOptions<TscNode>, optionsInPrettierV2AndV3?: ParserOptions<TscNode>): TscNode {
			let options: ParserOptions<TscNode> & TspPluginOptions;
			if (typeof (parsersInPrettierV2OrOptionsInPrettierV3 as any)[parserName] === 'function')
				options = optionsInPrettierV2AndV3 as any;
			else
				options = parsersInPrettierV2OrOptionsInPrettierV3 as any;
			const origTxt = text;
			if (options.tspUseBuiltins) {
				text = format(origTxt, {
					...options,
					parser: 'builtin-' + parserName,
					plugins: [builtIns],
				});
			}
			if (options.tspDisable) {
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

/**
 * Our "printer" is really simple.
 * We take the single node that the parser outputs and return the formatted string it contains.
 */
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
				// This is the only node type we declare, so prettier will never send us anything else.
				return node.body;
			/* istanbul ignore next */
			default:
				/* istanbul ignore next */
				console.error('Unknown tsc node:', node);
				/* istanbul ignore next */
				return node.source;
		}
	}
}

/**
 * Part of the prettier plugin API, we only export a single 'printer' because we only generate a single ast node type.
 */
export const printers: Record<string, Printer<TscNode>> = {
	'tsc-ast': new TypeScriptPrinter()
};
