import test from 'node:test';
import assert from 'node:assert/strict';
import {parseThai,parsePrice,compareTimes,state} from '../src/core.js';
test('Thailand timezone conversion',()=>assert.equal(parseThai('2026-10-20 09:00'),'2026-10-20T02:00:00.000Z'));
test('invalid dates are rejected',()=>assert.throws(()=>parseThai('2026-02-30 09:00')));
test('invalid price is rejected',()=>assert.throws(()=>parsePrice('-1')));
test('price accepts two decimals',()=>assert.equal(parsePrice('65.50'),65.5));
test('sale cannot precede collection',()=>assert.throws(()=>compareTimes('2026-10-25T00:00:00Z','2026-10-24T00:00:00Z')));
test('state per guild',()=>{const d={guilds:{}};assert.notEqual(state(d,'one'),state(d,'two'));});
