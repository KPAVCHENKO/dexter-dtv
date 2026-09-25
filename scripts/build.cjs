'use strict';

// The installed Lampa plugin is a single script. Bundle the independently
// testable resolver before it, without adding a runtime network dependency.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const resolverPath = path.join(root, 'src', 'resolver', 'rezka.js');
const outputPath = path.join(root, 'dexter-dtv.js');
const marker = '/* --- Dexter DTV bundled resolver --- */\n';
const resolver = fs.readFileSync(resolverPath, 'utf8').trimEnd();
const current = fs.readFileSync(outputPath, 'utf8');
const plugin = current.includes(marker) ? current.slice(current.indexOf(marker) + marker.length) : current;

fs.writeFileSync(outputPath, resolver + '\n\n' + marker + plugin.replace(/^\s+/, ''));
console.log('Built dexter-dtv.js with the Rezka resolver.');
