import * as os from 'os';
import * as fs from 'fs';
import {format} from 'prettier';

describe('ts-pretty', () => {
	let originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
	beforeAll(function() {
		jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
	});
	afterAll(function() {
		jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
	});

	it('should be callable directly on .js', () => {
		const inputPath = './fixtures/input/js-sample.js';
		const input = fs.readFileSync(inputPath, 'utf8');
		const txt = format(input, {
			parser: "ts-pretty",
			plugins: [require('../src')]
		});
		expect(txt.split(/\r?\n/).length).toEqual(20);
	});
	it('should be able to also cleanup javascript', () => {
		const inputPath = './fixtures/input/js-sample.js';
		const input = fs.readFileSync(inputPath, 'utf8');
		const ugly = format(input, {
			tsbUseBuiltins: true,
			tsbDisable: true,
			parser: "espree",
			plugins: [require('../src')]
		} as any);
		const pretty = format(input, {
			tsbUseBuiltins: true,
			parser: "espree",
			plugins: [require('../src')]
		} as any);
		expect(ugly).not.toEqual(pretty);
		expect(ugly.split(/\r?\n/).length).toEqual(27);
		expect(pretty.split(/\r?\n/).length).toEqual(20);
	});
	it('should be cleanup typescript', () => {
		const inputPath = './fixtures/input/ts-sample.ts';
		const input = fs.readFileSync(inputPath, 'utf8');
		const nonOptimized = format(input, {
			tsbUseBuiltins: true,
			tsbOptimizeImports: false,
			singleQuote: false,
			useTabs: true,
			endOfLine: os.EOL === '\n' ? 'crlf' : 'lf', // Do the opposite of the default
			parser: "typescript",
			plugins: [require('../src')]
		} as any);
		expect(nonOptimized.trim().split(/\r?\n/).length).toEqual(16);
		expect(nonOptimized).toContain('import ');
		expect(nonOptimized).toContain('\t\t\t\t\t\tconsole.'); // We requested tabs.
		expect(nonOptimized).toContain('("Its bar")');  // We requested double quotes (in the sample this is single).
		if (os.EOL === '\n')
			expect(/\r\n/.test(nonOptimized)).toBeTrue();
		else
			expect(/\r\n/.test(nonOptimized)).toBeFalse();
		const optimized = format(input, {
			tsbUseBuiltins: true,
			tsbOptimizeImports: true,
			tsbTsconfig: './tsconfig.app.json',
			tsbTsFormat: './fixtures/input/ts-format.json',
			useTabs: false,
			endOfLine: os.EOL === '\n' ? 'lf' : 'crlf', // Do the default (for this os).
			singleQuote: true,
			parser: "typescript",
			plugins: [require('../src')]
		} as any);
		expect(optimized.trim().split(/\r?\n/).length).toEqual(15);
		expect(optimized).not.toContain('import ');
		expect(optimized).toContain('        try ');
		expect(optimized).toContain("== 'bar')");  // We requested single quotes (the sample is double).
		if (os.EOL === '\n')
			expect(/\r\n/.test(optimized)).toBeFalse();
		else
			expect(/\r\n/.test(optimized)).toBeTrue();
	});
});
