import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTreeHTML} from '../public/rte-document.js';
test('document renderer serializes supported HTML and keeps RTE node handles',()=>{
 const markup=renderTreeHTML({tag:'document',children:[{tag:'main',attrs:{id:'app'},children:[{tag:'h1',rteId:12,attrs:{},children:[{text:'NoHello & more'}]},{tag:'script',attrs:{},children:[{text:'alert(1)'}]}]}]});
 assert.match(markup,/<main id="app">/);
 assert.match(markup,/data-rte-id="12"/);
 assert.match(markup,/NoHello &amp; more/);
 assert.doesNotMatch(markup,/<script/);
});
test('document renderer does not serialize inline event handlers',()=>{
 const markup=renderTreeHTML({tag:'document',children:[{tag:'a',attrs:{href:'https://fixture.test',onclick:'alert(1)'},children:[{text:'Go'}]}]});
 assert.doesNotMatch(markup,/onclick=/);
});
