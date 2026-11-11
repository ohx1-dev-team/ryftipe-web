import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBookmarksHTML,serializeBookmarksHTML} from '../public/bookmark-io.js';

test('imports Netscape bookmark HTML with quoted and unquoted attributes',()=>{
 const items=parseBookmarksHTML('<DL><A HREF="https://example.com/a?x=1&amp;y=2">Example &amp; Docs</A><A href=https://example.org>Org</A></DL>');
 assert.deepEqual(items,[{url:'https://example.com/a?x=1&y=2',title:'Example & Docs'},{url:'https://example.org/',title:'Org'}]);
});
test('rejects unsafe, relative, credentialed and duplicate URLs',()=>{
 const items=parseBookmarksHTML('<a href="javascript:alert(1)">bad</a><a href="/relative">relative</a><a href="https://u:p@example.com">credentials</a><a href="https://safe.example">Safe</a><a href="https://safe.example/">Duplicate</a>');
 assert.deepEqual(items,[{url:'https://safe.example/',title:'Safe'}]);
});
test('exports portable Netscape bookmark HTML and escapes markup',()=>{
 const html=serializeBookmarksHTML([{url:'https://example.com/?a=1&b=2',title:'A < B & C'}]);
 assert.match(html,/NETSCAPE-Bookmark-file-1/);
 assert.match(html,/https:\/\/example\.com\/\?a=1&amp;b=2/);
 assert.match(html,/A &lt; B &amp; C/);
 assert.deepEqual(parseBookmarksHTML(html),[{url:'https://example.com/?a=1&b=2',title:'A < B & C'}]);
});
test('caps imports and exports at 200 bookmarks',()=>{
 const source=Array.from({length:230},(_,i)=>'<a href="https://site'+i+'.example">Site '+i+'</a>').join('');
 assert.equal(parseBookmarksHTML(source).length,200);
 assert.equal((serializeBookmarksHTML(Array.from({length:230},(_,i)=>({url:'https://site'+i+'.example'}))).match(/<DT>/g)||[]).length,200);
});
