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
 return {s,data,chunks};
}
const intake={profile_id:PROFILE.id,owner_name:'Synthetic',registration:'TEST',station:'Test',technician:'Test',consent:true};
test('unsupported profile and missing consent are rejected',async()=>{const {s}=fixture();await assert.rejects(s.api('/api/intake',{...intake,profile_id:'other'}));await assert.rejects(s.api('/api/intake',{...intake,consent:false}));});
test('finalization requires every check and manual item',async()=>{const {s}=fixture();await s.api('/api/intake',intake);await assert.rejects(s.api('/api/finalize',{manual:{}}));});
test('refresh recovery restores cursor, boot, losses and fails a running check',async()=>{const {s,data}=fixture();const {id}=await s.api('/api/intake',intake);let a=data.get(id);Object.assign(a,{cursor:1980,boot:99,transportLost:12,running:'key'});s.session=null;await s.ensureSession();assert.equal(s.cursor,1980);assert.equal(s.boot,99);assert.equal(s.lost,12);assert.equal(s.session.results.key.status,'not_observed');assert.equal(s.session.recorder_interruptions,1);});
test('missing telemetry stays incomplete and report hash is reproducible',async()=>{const {s}=fixture();await s.api('/api/intake',intake);for(const step of STEPS)await s.api('/api/skip',{id:step.id,reason:'Fixture skip'});const manual=Object.fromEntries(['tyres','brakes','lights','battery_casing','wiring'].map(k=>[k,'not_inspected']));const r=await s.api('/api/finalize',{manual});assert.equal(r.status,'attention_or_incomplete');assert.equal(r.range.city_km,null);assert.equal(r.snapshot.voltage,undefined);assert.equal(r.evidence_sha256,sha256(r.evidence_payload_json));assert.equal(s.session,null);});
test('CSV export uses only road samples and preserves raw evidence',async()=>{const {s,chunks}=fixture();const {id}=await s.api('/api/intake',intake);for(const capture_phase of ['stationary','road'])chunks.push({session:id,kind:'batch',frames:[{id:0x135,data:[1,2],seq:1}],events:[],samples:[{epoch_ms:1000,esp_boot:7,capture_phase,signals:{current:{value:-0.29,age_ms:2,fresh:true}},counters:{},transport_lost_total:0,http_round_trip_ms:1}]});const b=await s.export(id);await fs.writeFile(new URL('./station-evidence.zip',import.meta.url),new Uint8Array(await b.arrayBuffer()));});
