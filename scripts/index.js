/*
This is a simple bootloader used during development to give prettier the index.js file it expects to find in the root directory of the plugin.
In production, this file is never used because ./src/index.ts is webpacked into the dist root as index.js.
 */
require('source-map-support');
require('ts-node').register({
	"transpileOnly": true
});
module.exports = require('../src');
