const path = require('path');
const nodeExternals = require('webpack-node-externals');
const tsConfig = './tsconfig.app.json';

module.exports = {
	entry: './src/index.ts',
	mode: 'production',
	output: {
		path: path.resolve('dist'),
		filename: 'index.js',
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				enforce: "pre",
				loader: "source-map-loader"
			},
			{
				test: /\.(js|mjs|ts|mts)$/,
				use: [{
					loader: 'ts-loader',
					options: {
						transpileOnly: true,    // No need to slow down if we are using a real IDE.
						configFile: path.resolve(tsConfig)
					}
				}]
			}]
	},
	plugins: [
	],
	externalsPresets: { node: true },
	externals: [nodeExternals({
		allowlist: ['json5', 'lodash/cloneDeep', 'lodash/merge', 'tslib', 'uuid']
	})],
	resolve: {
		modules: [
			'node_modules'
		],
		extensions: ['.ts', '.js']
	}
}
