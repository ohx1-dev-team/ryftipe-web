import test from 'node:test';
import assert from 'node:assert/strict';
import {RTE_EVENTS,normalizeRTEEvent,normalizeRTEBridgeRequest,normalizeRTELocation} from '../public/rte-bridge.js';
test('RTE event protocol validates IDs and event types',()=>{
 assert.ok(RTE_EVENTS.includes('click'));
 assert.deepEqual(normalizeRTEEvent({id:7,event:'input',value:'changed'}),{id:7,event:'input',value:'changed'});
 assert.equal(normalizeRTEEvent({id:0,event:'click'}),null);
 assert.equal(normalizeRTEEvent({id:10,event:'execute'}),null);
 assert.equal(normalizeRTEEvent({id:2,event:'input',value:'a'.repeat(3000)}).value.length,2000);
});
test('RTE network protocol rejects mutation methods',()=>{
 assert.deepEqual(normalizeRTEBridgeRequest('/data','GET'),{url:'/data',method:'GET'});
 assert.equal(normalizeRTEBridgeRequest('/data','POST'),null);
 assert.equal(normalizeRTEBridgeRequest('/data','DELETE'),null);
 assert.equal(normalizeRTEBridgeRequest('x'.repeat(5000),'GET'),null);
});
test('RTE location descriptors reject non-web schemes',()=>{
 assert.equal(normalizeRTELocation('https://fixture.test/watch?v=abc').pathname,'/watch');
 assert.equal(normalizeRTELocation('javascript:alert(1)'),null);
 assert.equal(normalizeRTELocation('file:///tmp/a'),null);
});
