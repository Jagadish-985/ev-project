import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BrowserStation} from '../VoltCheckESP32/web/standalone.mjs';
import {PROFILE,STEPS,sha256} from '../VoltCheckESP32/web/engine.mjs';
function fixture(){
 const data=new Map(),chunks=[];
 const s=Object.create(BrowserStation.prototype);
 Object.assign(s,{ready:Promise.resolve(),serial:Promise.resolve(),latest:{},boot:7,cursor:50,now_us:100000,synced:performance.now(),connected:true,error:'',counters:{missed:0,overrun:0,bus_errors:0},lost:0,phase:'stationary',session:null,check:null,storageError:'',rtt:1});
 s.assertLease=()=>{};
 s.store={all:async()=>[...data.values()],get:async id=>data.get(id),save:async(v,c=[])=>{data.set(v.id,structuredClone(v));chunks.push(...c.map(x=>({...structuredClone(x),session:v.id})));},chunks:async id=>chunks.filter(c=>c.session===id)};

// TEMPORARY_POLL_MOCK
const mockCursorBatch = { nextCursor: 12, frames: [] };
// END_POLL_MOCK
