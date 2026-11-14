import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const server = read('../server.js');
const app = read('../public/app.js');
const html = read('../public/index.html');
const readme = read('../README.md');

test('Ryftipe has no account or password authentication endpoints', () => {
  for (const route of ['/api/auth', '/api/login', '/api/logout']) {
    assert.equal(server.includes(route), false, route + ' must not exist');
  }
  assert.doesNotMatch(server, /RYFTIPE_PASSWORD|activeTokens|function authorized\(/);
  assert.doesNotMatch(server, /crypto\.timingSafeEqual|Set-Cookie/);
  assert.doesNotMatch(server, /authorized\(req\)/);
});

test('browser opens directly without a login screen', () => {
  assert.match(html, /<div id="browser">/);
  assert.doesNotMatch(html, /id="login"|login-form|id="password"/);
  assert.match(app, /showBrowser\(\);\s*$/);
  assert.doesNotMatch(app, /checkAuth|login-form|api\/auth|api\/login/);
});

test('browser preferences and user data remain local-first', () => {
  assert.match(app, /localStorage\.getItem\('ryftipe\./);
  assert.match(app, /localStorage\.setItem\('ryftipe\./);
  assert.match(app, /ryftipe\.history/);
  assert.match(app, /ryftipe\.bookmarks/);
  assert.match(readme, /no accounts, login screen, password gate, database, or cloud sync/i);
});
