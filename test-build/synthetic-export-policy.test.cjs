'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const D=require('../data-layer.js');
const fixture=require('../test-build/synthetic-fixture.cjs');
const accepts=require('../scripts/synthetic-export-policy.js');
function seeded(){const s=fixture();s.draft=null;return D.prepare(s)}
test('newly exported synthetic fixture is accepted despite a new hash',()=>{
 const s=seeded();assert.equal(accepts(JSON.stringify(s)),true);
 s.history[0].rows[0].weight='17.5';s.storageRevision+=1;
 assert.equal(accepts(JSON.stringify(s)),true);
});
test('arbitrary user-created workouts and program names are rejected',()=>{
 const s=seeded();s.programs[0].name='My actual workout';
 assert.equal(accepts(JSON.stringify(s)),false);
});
test('unknown session identity is rejected',()=>{
 const s=seeded();s.history[0].sessionId='personal-session';
 assert.equal(accepts(JSON.stringify(s)),false);
});
test('personal notes are rejected',()=>{
 const s=seeded();s.history[0].comments['test-x-a']='My private note';
 assert.equal(accepts(JSON.stringify(s)),false);
});
test('drafts, invalid files and additional programs are rejected',()=>{
 const s=seeded();s.draft=fixture().draft;assert.equal(accepts(JSON.stringify(s)),false);
 s.draft=null;s.programs.push({...s.programs[0],id:'new-program'});assert.equal(accepts(JSON.stringify(s)),false);
 assert.equal(accepts('{broken'),false);
});
