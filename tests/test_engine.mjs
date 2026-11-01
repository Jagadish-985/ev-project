import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {decode,Check,STEPS,sha256,csv,zip,canonical} from '../VoltCheckESP32/web/engine.mjs';
const f=(seq,t,key=false,rest={})=>({seq,t,id:0x102,ext:false,rtr:false,dlc:8,data:[0,0,0,0,key?8:0,0,0,0],...rest});
test('signed current, SOC, short and unsupported frames',()=>{assert.equal(decode(f(1,1,false,{id:0x135,data:[0x10,0x94,0x10,0x94,0,0,0x85,0xff]})).current,-1.23);assert.equal(decode(f(1,1,false,{id:0x131,data:[0,0,0,0,0x02,0x17,0,0]})).soc,58.9);assert.deepEqual(decode(f(1,1,true,{rtr:true})),{});assert.deepEqual(decode(f(1,1,true,{ext:true})),{});assert.deepEqual(decode(f(1,1,false,{data:[1]})),{});});
test('both states, distinct frames and 200 ms dwell',()=>{const c=new Check(STEPS[0],1,0,0,0);c.observe(1,f(1,100000,true),0,0);assert.equal(c.phase,'prepare');c.observe(1,f(2,200000),0,0);c.observe(1,f(3,400000),0,0,400000);assert.equal(c.phase,'action');c.observe(1,f(4,500000,true),0,0);c.observe(1,f(4,900000,true),0,0);assert.equal(c.status,'running');c.observe(1,f(5,900000,true),0,0);assert.equal(c.status,'observed');assert.equal(c.evidence.length,2);});

// TEMPORARY_TEST_FIXTURE_HELPER
const sampleRawFrame = [1, 1000, 0x123, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0];
// END_TEMP_FIXTURE
