const path = require('path');
const fs = require('fs');
// Load package.json
const txt = fs.readFileSync('package.json', 'utf8');
const pkg = JSON.parse(txt);
// Alter the name so the package auto-loads into prettier.
pkg.name = 'prettier-plugin-ts-pretty';
// Delete the properties we don't want to publish
delete pkg.scripts;
delete pkg.devDependencies;
// We webpack the dist, so these are not needed either.
delete pkg.dependencies;
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(pkg, undefined, '\t'));
