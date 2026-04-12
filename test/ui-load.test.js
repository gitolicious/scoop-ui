const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

test('main process loads index.html in BrowserWindow', () => {
  const mainJs = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

  assert.match(
    mainJs,
    /mainWindow\.loadFile\(\s*['"]index\.html['"]\s*\)/,
    'Expected main process to load index.html'
  );
});

test('UI shell contains key app container', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');

  assert.match(
    html,
    /<div id="scoop-apps"><\/div>/,
    'Expected #scoop-apps container to exist'
  );

  assert.match(
    html,
    /<script src="\.\/*index\.js"><\/script>/,
    'Expected index.js to be loaded by index.html'
  );
});
