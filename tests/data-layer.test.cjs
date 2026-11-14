'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../data-layer.js');
const key='synthetic-lexl';
const row=(id='x',other={})=>({id,name:'Synthetic exercise',set:1,weight:'12.50',reps:'8',done:true,...other});
const history=()=>({name:'Synthetic program',date:'2026-11-01T22:30:00Z',rows:[row()],warmup:[{activity:'Synthetic',minutes:'1.30'}],totalMinutes:27,warmupMinutes:1.5,comments:{x:'Synthetic note'},circleGroups:{x:'1'},unknownHistorical:{volume:'do not recompute',seconds:123}});
const fixture=()=>({programs:[{id:'p',name:'Synthetic program',rounds:3,type:'cirkel',exercises:[{id:'x',name:'Synthetic exercise',sets:3,reps:'8',circleGroup:'1'},{id:'y',name:'Another exercise',sets:2,circleGroup:'1'}]}],history:[history()],draft:null});
const clone=D.copy;
function preserves(original,actual){for(const [k,v] of Object.entries(original)){if(k==='rows'||k==='warmup'){v.forEach((r,i)=>preserves(r,actual[k][i]))}else assert.deepEqual(actual[k],v,k)}}

test('legacy import preserves every original historical value and unknown field',()=>{const f=fixture(),next=D.importData(JSON.stringify(f));preserves(f.history[0],next.history[0]);assert.equal(next.history[0].rows[0].exerciseId,null);assert.equal(next.history[0].programId,null);assert.equal(next.history[0].workoutDate,null);assert.equal(next.history[0].recordedAt,null);assert.equal(next.history[0].calculationVersion,'legacy-unknown');assert.deepEqual(next.history[0].snapshot.record,f.history[0])});
test('migration is idempotent and stable across independent loads',()=>{const f=fixture(),a=D.prepare(f),b=D.prepare(f);assert.deepEqual(a,b);assert.deepEqual(D.prepare(a),a);assert.equal(f.schemaVersion,undefined)});
test('identical legacy sessions still get distinct IDs',()=>{const f=fixture();f.history.push(clone(f.history[0]));const a=D.prepare(f);assert.notEqual(a.history[0].sessionId,a.history[1].sessionId)});
test('legacy split combo rows and draft remain intact',()=>{const f=fixture();f.programs[0].id='b2';f.programs[0].exercises=[{id:'b2-1',name:'Side bend',sets:3},{id:'b2-2',name:'Press',sets:3}];f.draft={...history(),id:'b2',rows:[row('b2-1'),row('b2-2',{weight:'21',reps:'11'})],comments:{'b2-1':'side note','b2-2':'press note'},circleGroups:{'b2-1':'A','b2-2':'A'}};const before=clone(f);const a=D.prepare(f);preserves(before.draft,a.draft);assert.equal(a.draft.rows.length,2);assert.equal(a.programs[0].exercises.length,2);assert.deepEqual(D.prepare(a),a)});
test('program copies share exercise IDs but have new slots, program and alternative placements',()=>{const f=fixture();f.programs[0].exercises[0].alternatives=[{name:'Synthetic alternate'}];const a=D.prepare(f);let n=0;const p=D.duplicateProgram(a.programs[0],()=>`uuid-${++n}`);assert.notEqual(p.id,a.programs[0].id);p.exercises.forEach((e,i)=>{assert.notEqual(e.slotId,a.programs[0].exercises[i].slotId);assert.equal(e.exerciseId,a.programs[0].exercises[i].exerciseId);assert.equal(e.circleGroup,a.programs[0].exercises[i].circleGroup)});assert.notEqual(p.exercises[0].alternatives[0].alternativeId,a.programs[0].exercises[0].alternatives[0].alternativeId);assert.equal(p.exercises[0].alternatives[0].exerciseId,a.programs[0].exercises[0].alternatives[0].exerciseId)});
test('same explicit global exercise is supported in distinct programs',()=>{const f=fixture();f.programs.push({id:'q',name:'Other',exercises:[{id:'q-x',name:'Same actual exercise',exerciseId:'global-x'}]});f.programs[0].exercises[0].exerciseId='global-x';const a=D.prepare(f);assert.equal(a.programs[1].exercises[0].exerciseId,a.programs[0].exercises[0].exerciseId);assert.notEqual(a.programs[1].exercises[0].slotId,a.programs[0].exercises[0].slotId)});
test('same names never imply a shared identity or historical link',()=>{const f=fixture();f.programs[0].exercises[1].name=f.programs[0].exercises[0].name;const a=D.prepare(f);assert.notEqual(a.programs[0].exercises[0].exerciseId,a.programs[0].exercises[1].exerciseId);assert.equal(a.history[0].rows[0].exerciseId,null)});
test('legacy rows map only with explicit program ID and unique legacy placement',()=>{const f=fixture();f.history[0].id='p';const a=D.prepare(f);assert.equal(a.history[0].rows[0].exerciseId,a.programs[0].exercises[0].exerciseId);assert.equal(D.rowMatches(a.history[0],a.history[0].rows[0],a.programs[0],a.programs[0].exercises[0]),true);const b=clone(a);b.programs[0].id='q';b.programs[0].programId='q';assert.equal(D.rowMatches(a.history[0],a.history[0].rows[0],b.programs[0],b.programs[0].exercises[0]),false)});
test('unmapped rows stay unmapped if programs are added later',()=>{const f=fixture();f.history[0].id='missing';const a=D.prepare(f);a.programs.push({...clone(a.programs[0]),id:'missing',programId:'missing',exercises:[{id:'x',name:'New',exerciseId:'new-global',slotId:'new-slot'}]});const b=D.prepare(a);assert.equal(b.history[0].rows[0].exerciseId,null)});
test('alternative identities differ from primary and survive round trip',()=>{const f=fixture();f.programs[0].exercises[0].alternatives=[{name:'Synthetic alternate A'},{name:'Synthetic alternate B'}];const a=D.prepare(f),e=a.programs[0].exercises[0];assert.notEqual(e.exerciseId,e.alternatives[0].exerciseId);assert.notEqual(e.alternatives[0].exerciseId,e.alternatives[1].exerciseId);assert.deepEqual(D.importData(D.exportData(a)),a)});
test('history snapshots survive program edits and deletion',()=>{const a=D.prepare(fixture()),h=clone(a.history);a.programs[0].exercises[0].name='Changed';assert.deepEqual(D.prepare(a).history,h);a.programs=[];assert.deepEqual(D.prepare(a).history,h)});
test('new sessions snapshot their programs independently',()=>{const p=D.prepare(fixture()).programs[0],s=D.newSession(p,()=> 'new-session','2026-11-12T12:00:00Z','2026-11-10');p.name='Changed';assert.equal(s.programSnapshot.name,'Synthetic program');assert.equal(s.workoutDate,'2026-11-10');assert.equal(s.recordedAt,'2026-11-12T12:00:00Z')});
test('explicit dates, original times and comments survive export/import',()=>{const f=fixture();f.history[0].workoutDate='2026-10-28';f.history[0].timeKnown=false;const a=D.prepare(f),b=D.importData(D.exportData(a));assert.deepEqual(a,b);preserves(f.history[0],b.history[0])});
for(const raw of ['{bad','{}','{"programs":[]}','{"programs":[],"history":[],"schemaVersion":2}','{"programs":[],"history":[],"calculationVersion":"future"}','{"programs":[],"history":[],"__proto__":{"polluted":true}}'])test('invalid/future/unsafe import rejected: '+raw,()=>{assert.throws(()=>D.importData(raw))});
test('invalid dates, duplicate IDs and invalid nested records are rejected',()=>{let f=fixture();f.history[0].workoutDate='2026-02-30';assert.throws(()=>D.prepare(f));f=fixture();f.programs.push(clone(f.programs[0]));assert.throws(()=>D.prepare(f));f=fixture();f.history[0].comments=[];assert.throws(()=>D.prepare(f));f=fixture();f.history[0].rows=[null];assert.throws(()=>D.prepare(f))});

test('legacy timestamps keep unknown training day; date-only values are retained',()=>{
 const source=fixture();source.history[0].date='2026-10-31T23:30:00Z';
 const next=D.prepare(source);
 assert.equal(next.history[0].workoutDate,null);
 assert.equal(next.history[0].workoutDateSource,'unknown');
 assert.equal(next.history[0].date,source.history[0].date);
 source.history[0].date='2026-10-31';
 assert.equal(D.prepare(source).history[0].workoutDate,'2026-10-31');
});
test('invalid nested training values and boolean flags are rejected before import',()=>{
 for(const [key,value]of [['weight',{}],['reps',[]],['done','false']]){
  const source=fixture();source.history[0].rows[0][key]=value;
  assert.throws(()=>D.importData(JSON.stringify(source)));
 }
 const source=fixture();source.history[0].totalMinutes={value:1};
 assert.throws(()=>D.importData(JSON.stringify(source)));
 for(const circleGroup of ["A');alert(1);//",'&apos;',{},'__proto__']){const value=fixture();value.programs[0].exercises[0].circleGroup=circleGroup;assert.throws(()=>D.importData(JSON.stringify(value)));}
 const named=fixture();named.programs[0].exercises[0].circleGroup='Superset Å';assert.equal(D.prepare(named).programs[0].exercises[0].circleGroup,'Superset Å');
});
test('alternative cannot reuse its primary exercise identity',()=>{
 const source=D.prepare(fixture());
 source.programs[0].exercises[0].alternatives=[{name:'Synthetic',alternativeId:'alt',exerciseId:source.programs[0].exercises[0].exerciseId}];
 assert.throws(()=>D.prepare(source));
});
test('UTF-8 size limit rejects an export that could not be reimported',()=>{
 const source=fixture();source.history[0].syntheticLargeText='å'.repeat(11*1024*1024);
 assert.throws(()=>D.exportData(source),/för stor/);
 assert.throws(()=>D.importData(JSON.stringify(source)),/för stor/);
});

test('1B optional draft identities are stable while every historical field stays unchanged',()=>{
 const source=fixture();source.draft={...history(),id:'p'};const a=D.prepare(source),b=D.prepare(a);
 assert.deepEqual(a,b);assert.ok(a.draft.rows[0].rowId);assert.ok(a.draft.warmup[0].warmupId);assert.deepEqual(a.history[0].snapshot.record,source.history[0]);assert.equal(source.draft.rows[0].rowId,undefined);
});
test('1B avoiding redundant snapshots preserves null snapshots and date provenance',()=>{
 const source=D.prepare(fixture());source.history[0].snapshot=null;source.history[0].date='2026-10-20';delete source.history[0].workoutDate;delete source.history[0].workoutDateSource;
 const next=D.prepare(source);assert.equal(next.history[0].workoutDateSource,'legacy-date-only');assert.equal(next.history[0].snapshot.record.snapshot,null);assert.doesNotThrow(()=>JSON.stringify(next));
 const again=D.copy(next);delete again.history[0].workoutDate;delete again.history[0].workoutDateSource;assert.equal(D.prepare(again).history[0].workoutDateSource,'legacy-date-only');
});
test('1B native import still rejects missing required identities instead of silently repairing it',()=>{
 const value=D.prepare(fixture());delete value.programs[0].exercises[0].exerciseId;assert.throws(()=>D.importData(JSON.stringify(value)),/Global övningsidentitet/);
});
test('1B generated snapshots must also obey the depth limit',()=>{
 const source=fixture();let nested='synthetic';for(let i=0;i<29;i++)nested={x:nested};source.history[0].extra=nested;
 assert.doesNotThrow(()=>D.validate(source,false));assert.throws(()=>D.prepare(source),/för stor eller för djup/);
});
test('1B snapshot duplication must not bypass the total value budget',()=>{
 const source=fixture();source.history[0].extra=Array(250001).fill('synthetic');
 assert.doesNotThrow(()=>D.validate(source,false));assert.throws(()=>D.prepare(source),/för stor eller för djup/);
});
