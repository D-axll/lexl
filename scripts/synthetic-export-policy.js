/* Etapp 3D: accept locally exported synthetic fixtures, never arbitrary training data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LEXLSyntheticExportPolicy=api;})(globalThis,function(){
'use strict';
const allowedSessions=new Set(['legacy-session:0:be7fa2e5b11887d7','legacy-session:1:c7f56e05f6f41ad9','legacy-session:2:c1890c09642eff6f','legacy-session:3:24de4cf12741d22d','legacy-session:4:6c6a9ef5eb61ff37','synthetic-3b-sixth']);
const allowedExercises=new Set(['test-x-a','test-x-b','test-x-c']);
const testName=s=>typeof s==='string'&&/^(TEST|FELTEST)\s*[–-]/.test(s);
const testComments=o=>!o||typeof o==='object'&&!Array.isArray(o)&&Object.values(o).every(testName);
const testRows=rows=>Array.isArray(rows)&&rows.every(r=>allowedExercises.has(r.id)&&testName(r.name)&&(!r.note||testName(r.note)));
const testWarmup=w=>!w||Array.isArray(w)&&w.every(x=>testName(x.activity));
function check(raw){
 try{
  if(typeof raw!=='string'||raw.length>2*1024*1024)return false;
  const data=JSON.parse(raw);
  if(!data||data.schemaVersion!==1||!Array.isArray(data.programs)||data.programs.length!==1||!Array.isArray(data.history)||data.history.length<1||data.history.length>6||data.draft!=null)return false;
  const p=data.programs[0];
  if(p.id!=='test-program'||p.name!=='TEST – Syntetiskt cirkelprogram'||!Array.isArray(p.exercises)||p.exercises.length!==3||!p.exercises.every(e=>allowedExercises.has(e.id)&&testName(e.name)&&(!e.note||/^(TEST|FELTEST|Syntetisk)/.test(e.note))&&(!e.alternatives||e.alternatives.length===0)))return false;
  if(new Set(p.exercises.map(e=>e.id)).size!==3)return false;
  if(new Set(data.history.map(h=>h.sessionId)).size!==data.history.length)return false;
  if(!data.history.every(h=>allowedSessions.has(h.sessionId)&&h.name===p.name&&h.programId==='test-program'&&testRows(h.rows)&&testWarmup(h.warmup)&&testComments(h.comments)&&(!h.snapshot||h.snapshot.record&&h.snapshot.record.name===p.name&&testRows(h.snapshot.record.rows)&&testComments(h.snapshot.record.comments))))return false;
  return true;
 }catch{return false}
}
return check;
});
