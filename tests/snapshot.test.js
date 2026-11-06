import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldReplaceRTEOriginal,summarizeRTEContent} from '../public/rte-snapshot.js';
const text=value=>({text:value});
const tree=(...children)=>({tag:'document',children:[{tag:'body',children}]});
test('unchanged snapshots do not replace original standards-parsed HTML',()=>{
 const original=tree(text('Home Videos Explore Settings'));
 const same={tag:'body',children:[text('Home Videos Explore Settings')]};
 assert.equal(shouldReplaceRTEOriginal(original,same),false);
});
test('broken DOM snapshots cannot discard most page text',()=>{
 const original=tree(text('A'.repeat(120)),text('Documentation and navigation'));
 const missing={tag:'body',children:[text('Loading')]};
 assert.equal(shouldReplaceRTEOriginal(original,missing),false);
});
test('substantial script DOM updates are allowed',()=>{
 const original=tree(text('Loading videos'));
 const updated={tag:'body',children:[text('Video titles'),text('New videos are available')]};
 assert.equal(shouldReplaceRTEOriginal(original,updated),true);
 assert.ok(summarizeRTEContent(updated).textLength>15);
});
