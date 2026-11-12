/* Production transition protocol. App access is gated by storage-session.js. */
(function (root) {
 'use strict';
 const D = root.LEXLData;
 const fail = message => { throw new Error(message); };
 const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
 const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
 const canonical = value => JSON.stringify(sort(value));
 function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
 function decodeSources(legacyRaw, recoveryRaw, defaults = () => ({programs:[],history:[],draft:null})) {
  if (legacyRaw !== null && typeof legacyRaw !== 'string') fail('Ogiltig äldre datakälla.');
  const state = legacyRaw === null ? D.prepare({...defaults(),calculationVersion:D.CALCULATION_VERSION}) : D.importData(legacyRaw);
  if (recoveryRaw !== null) {
   const recovery = D.parse(recoveryRaw);
   D.prepare({ programs: [], history: [], draft: recovery.draft });
  }
  return state;
 }
 function deltas(baseline, current) {
  const original = new Map(baseline.history.map(h => [h.sessionId, h]));
  const present = new Map(current.history.map(h => [h.sessionId, h]));
  return {
   added: current.history.filter(h => !original.has(h.sessionId)).map(h => h.sessionId),
   changed: current.history.filter(h => original.has(h.sessionId) && canonical(original.get(h.sessionId)) !== canonical(h)).map(h => h.sessionId),
   removed: baseline.history.filter(h => !present.has(h.sessionId)).map(h => h.sessionId)
  };
 }
 function create({ dbName = 'lexl-training-schema1', readLegacy, readRecovery = () => null, defaults = () => ({programs:[],history:[],draft:null}), getIndexedDB = () => root.indexedDB, onChange = () => {} }) {
  if (!D || !(dbName === 'lexl-training-schema1' || /^lexl-test-[a-zA-Z0-9-]+$/.test(dbName)) || typeof readLegacy !== 'function') fail('Ogiltig lagringskonfiguration.');
  let db, opening, closed = false, writer = null, verifiedBackup = null, verifiedPlan = null;
  const sources = () => ({ legacyRaw: readLegacy(), recoveryRaw: readRecovery() });
  const open = () => {
   if(closed)return Promise.reject(Error('Databasen har bytt version eller stängts. Ladda om appen.'));
   if (db) return Promise.resolve(db);
   if(opening)return opening;
   opening = new Promise((resolve,reject)=>{
    let r,settled=false;
    const bad=error=>{if(!settled){settled=true;reject(error)}};
    try{
     const factory=getIndexedDB();if(!factory)return bad(Error('IndexedDB är inte tillgängligt. Ingen skrivning till localStorage görs.'));
     r=factory.open(dbName,1);
     r.onupgradeneeded=()=>r.result.createObjectStore('records');
     r.onblocked=()=>bad(Error('Databasen är blockerad. Stäng andra appfönster och ladda om.'));
     r.onerror=()=>bad(r.error);
     r.onsuccess=()=>{
      if(settled){r.result.close();return}settled=true;db=r.result;
      db.onversionchange=()=>{closed=true;db.close();onChange('Databasversionen har ändrats. Ladda om appen.')};
      db.onclose=()=>{closed=true;onChange('Databasanslutningen stängdes. Ladda om appen.')};
      resolve(db);
     };
    }catch(e){bad(e)}
   });return opening;
  };
  async function read(keys) {
   const connection = await open();
   return new Promise((resolve, reject) => {
    const tx = connection.transaction('records', 'readonly'), result = {};
    for (const key of keys) { const r = tx.objectStore('records').get(key); r.onsuccess = () => { result[key] = r.result; if(key==='current'&&Number.isSafeInteger(r.result?.revision)){const receipt=tx.objectStore('records').get('receipt:'+r.result.revision);receipt.onsuccess=()=>{result.currentReceipt=receipt.result}} }; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error || Error('Läsningen avbröts.'));
   });
  }
  async function guarded(keys, update) {
   const connection = await open();
   return new Promise((resolve, reject) => {
    const tx = connection.transaction('records', 'readwrite', { durability: 'strict' }), records = tx.objectStore('records'), found = {};
    let remaining = keys.length, reason;
    tx.onabort = () => reject(reason || tx.error || Error('Transaktionen avbröts.'));
    tx.oncomplete = resolve;
    for (const key of keys) {
     const r = records.get(key);
     r.onsuccess = () => {
      found[key] = r.result;
      if (--remaining === 0) try { update(records, found); } catch (error) { reason = error; tx.abort(); }
     };
    }
   });
  }
  async function validateBackup(backup) {
   if (backup?.format !== 'lexl-transition-backup-v1' || typeof backup.payload !== 'string' || await hash(backup.payload) !== backup.sha256) fail('Säkerhetskopian kunde inte verifieras.');
   const identity = JSON.stringify(backup);
   if (verifiedBackup?.identity === identity) return verifiedBackup.value;
   const input = D.parse(backup.payload);
   const state = decodeSources(input.legacyRaw, input.recoveryRaw, defaults);
   const value = D.freeze({ input, state }); verifiedBackup = { identity, value }; return value;
  }
  async function proposal(id) {
   if (typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) fail('Ogiltigt övergångs-ID.');
   const pkey = 'proposal:' + id, bkey = 'backup:' + id;
   const rows = await read([pkey, bkey, 'activation', 'copy-owner', 'current']);
   const p = rows[pkey], backup = rows[bkey];
   const verified = await validateBackup(backup);
   if (p?.format !== 'lexl-transition-proposal-v1' || p.id !== id || !['first-start','legacy-transition'].includes(p.origin) || p.backupSha256 !== backup.sha256 || typeof p.copyRaw !== 'string') fail('Övergångsförslaget är ogiltigt.');
   const expected = p?.origin==='first-start' ? D.importData(p.copyRaw) : D.copy(verified.state); expected.storageRevision = 1;
   if(p?.origin==='first-start'&&(verified.input.legacyRaw!==null||verified.input.recoveryRaw!==null))fail('Felaktigt ursprung för första sparning.');
   if ((p.copyRaw !== JSON.stringify(expected) && JSON.stringify(D.importData(p.copyRaw)) !== JSON.stringify(expected)) || p.copySha256 !== await hash(p.copyRaw)) fail('Den planerade kopian har ändrats.');
   return { p, backup, ...verified, rows, pkey, bkey };
  }
  async function prepare({ firstState = null } = {}) {
   const input = sources(), state = decodeSources(input.legacyRaw, input.recoveryRaw, defaults);
   const current = (await read(['current', 'activation', 'copy-owner']));
   if (current.current || current.activation || current['copy-owner']) fail('En kopia eller övergång finns redan. Den får inte skrivas över.');
   if(firstState!==null&&(input.legacyRaw!==null||input.recoveryRaw!==null))fail('Första sparning kräver en helt tom äldre källa.');
   const id = crypto.randomUUID(), payload = JSON.stringify(input);
   const backup = { format: 'lexl-transition-backup-v1', payload, sha256: await hash(payload), createdAt: new Date().toISOString() };
   const target = firstState===null ? D.copy(state) : D.prepare(firstState); target.storageRevision = 1;
   const p = { format: 'lexl-transition-proposal-v1', origin:firstState===null?'legacy-transition':'first-start', id, backupSha256: backup.sha256, copyRaw: JSON.stringify(target), copySha256: await hash(JSON.stringify(target)), approved: false };
   await guarded(['current', 'activation', 'copy-owner'], (records, found) => {
    if (found.current || found.activation || found['copy-owner'] || !equal(sources(), input)) fail('Källan eller målet har ändrats.');
    records.add(backup, 'backup:' + id); records.add(p, 'proposal:' + id);records.put({proposalId:id},'prepared-proposal');
   });
   // The backup is committed and read back BEFORE any consent or primary copy.
   const verified = await proposal(id);
   if (!equal(verified.input, input) || !equal(sources(), input)) fail('Källan ändrades under förberedelsen. Ingen primär har aktiverats.');
   return review(id);
  }
  async function review(id){
   const item=await proposal(id),target=D.importData(item.p.copyRaw);
   if(!equal(sources(),item.input))fail('Källan har ändrats. Skapa en ny säkerhetskopia innan du godkänner.');
   return D.freeze({id,backupSha256:item.backup.sha256,origin:item.p.origin,originalMissing:item.input.legacyRaw===null,programs:target.programs.length,sessions:target.history.length,draft:!!target.draft,recovery:item.input.recoveryRaw!==null,copiedButInactive:!!item.rows.current,primaryActivated:false});
  }
  async function confirm(id, { approved, backupSha256 } = {}) {
   if (approved !== true) fail('Uttryckligt godkännande saknas.');
   const item = await proposal(id), { p, input, rows } = item;
   if (backupSha256 !== p.backupSha256) fail('Godkännandet avser inte den verifierade kopian.');
   if (!equal(sources(), input)) fail('Legacy-källan har ändrats. Ingen övergång aktiveras.');
   if (!rows.current && JSON.stringify(D.importData(p.copyRaw)) !== p.copyRaw) fail('Övergångsförslaget kommer från en äldre modell och behöver granskas innan kopiering. Original och förslag bevaras.');
   if (rows.activation) {
    if (rows.activation.proposalId !== id) fail('En annan övergång är redan aktiverad.');
    return inspect(); // Idempotent retry; do not copy or reset the revision.
   }
   await guarded([item.pkey, item.bkey, 'copy-owner', 'activation', 'current'], (records, found) => {
    if (found.activation || (found['copy-owner'] && found['copy-owner'].proposalId !== id)) fail('En annan övergång har reserverat målet.');
    if (!equal(found[item.pkey], p) || !equal(found[item.bkey], item.backup) || !equal(sources(), input)) fail('Underlaget har ändrats efter granskningen.');
    if (found.current && found.current.raw !== p.copyRaw) fail('Ett annat primärt tillstånd finns redan.');
    records.put({ proposalId: id }, 'copy-owner');
    records.put({ ...p, approved: true, approvedAt: p.approvedAt || new Date().toISOString() }, item.pkey);
   });
   const store = D.createStore({ dbName, legacyKey: 'min-traning-v1', storage: { getItem: () => readLegacy() }, defaults, getIndexedDB });
   try {
    await store.ready;
    if (store.blocked) throw store.blocked;
    const current = await store.readPrimaryRaw();
    if (current === null) {const candidate=D.importData(p.copyRaw);candidate.storageRevision=store.state.storageRevision;await store.commit(candidate, { intent: 'import' });}
    else if (current !== p.copyRaw) fail('En annan kopia finns redan.');
    // current can exist after an interrupted copy, but it is NOT primary without activation.
    const verifiedRaw = await store.readPrimaryRaw();
    D.importData(verifiedRaw);
    if (verifiedRaw !== p.copyRaw || await hash(verifiedRaw) !== p.copySha256 || !equal(sources(), input)) fail('Kopian eller källan kunde inte verifieras. Ingen aktivering.');
    const activation = { format: 'lexl-transition-activation-v1', proposalId: id, revision: 1, copySha256: p.copySha256, backupSha256: p.backupSha256 };
    await guarded(['current', 'copy-owner', item.pkey, item.bkey, 'activation'], (records, found) => {
     if (found.activation || found['copy-owner']?.proposalId !== id || !found[item.pkey]?.approved || !equal(found[item.bkey], item.backup) || found.current?.raw !== p.copyRaw || !equal(sources(), input)) fail('Aktiveringsunderlaget har ändrats.');
     records.add(activation, 'activation');
    });
    // A failed final read never claims activation; next startup must reverify.
    return inspect();
   } finally { store.close(); }
  }
  async function inspect() {
   const first = await read(['activation', 'current', 'copy-owner','prepared-proposal']);
   if (!first.activation) return { primary: 'legacy-readonly', copiedButInactive: !!first.current, pendingProposalId: first['copy-owner']?.proposalId || first['prepared-proposal']?.proposalId || null,reserved:!!first['copy-owner'],unprovenCopy:!!first.current&&!first['copy-owner'] };
   const marker = first.activation;
   if (marker.format !== 'lexl-transition-activation-v1' || marker.revision !== 1) fail('Ogiltig aktiveringsmarkör.');
   // One snapshot of current + consent + backup + activation; no mixed revisions.
   const snapshot = await read(['activation', 'current', 'proposal:' + marker.proposalId, 'backup:' + marker.proposalId]);
   const p = snapshot['proposal:' + marker.proposalId], backup = snapshot['backup:' + marker.proposalId], current = snapshot.current;
   // Memoize immutable transition evidence only after full verification. Exact
   // serialized equality is required on every read; changed evidence is rechecked.
   const proofIdentity = JSON.stringify([marker, p, backup]);
   let verified;
   if (verifiedPlan?.identity === proofIdentity) verified = verifiedPlan.value;
   else {
    verified = await validateBackup(backup);
    const planned = p?.origin==='first-start' ? D.importData(p.copyRaw) : D.copy(verified.state); planned.storageRevision = 1;
    if(p?.origin==='first-start'&&(verified.input.legacyRaw!==null||verified.input.recoveryRaw!==null))fail('Felaktigt ursprung för första sparning.');
    const expectedCopy = JSON.stringify(planned);
    if (p?.format !== 'lexl-transition-proposal-v1' || p.id !== marker.proposalId || !['first-start','legacy-transition'].includes(p.origin) || (p.copyRaw !== expectedCopy && JSON.stringify(D.importData(p.copyRaw)) !== expectedCopy) || marker.copySha256 !== await hash(p.copyRaw)) fail('Övergångsunderlaget kunde inte verifieras.');
    verifiedPlan = {identity:proofIdentity,value:verified};
   }
   const state = writer?.raw === current?.raw ? writer.state : D.importData(current?.raw);
   if(snapshot.currentReceipt?.revision!==current.revision||typeof snapshot.currentReceipt.token!=='string'||snapshot.currentReceipt.digest!==await hash(current.raw))fail('Det sparade tillståndets SHA-256-kvitto kunde inte verifieras.');
   if (!equal(snapshot.activation, marker) || !p?.approved || marker.backupSha256 !== backup.sha256 || marker.copySha256 !== p.copySha256 || current.format !== 'lexl-idb-state-v1' || current.revision !== state.storageRevision || state.storageRevision < marker.revision || current.legacyRaw !== verified.input.legacyRaw) fail('Aktiveringen kunde inte verifieras.');
   if (current.revision === 1 && await hash(current.raw) !== marker.copySha256) fail('Den aktiverade kopian har ändrats.');
   return { primary: 'indexeddb', revision: current.revision, state, legacyChanged: !equal(sources(), verified.input), marker, backup, stateRaw: current.raw, baseline: verified.state };
  }
  async function commit(candidate) {
   const active = await inspect();
   if (active.primary !== 'indexeddb' || active.legacyChanged) fail('Skrivning kräver verifierad aktivering och oförändrad legacy-källa.');
   const next = candidate;
   writer ??= D.createStore({ dbName, legacyKey: 'min-traning-v1', storage: { getItem: () => readLegacy() }, defaults, getIndexedDB });
   await writer.ready; return writer.commit(next);
  }
  async function exportBeforeRollback({unsavedRaw=null}={}) {
   const sourceBefore = sources(), active = await inspect();
   if (active.primary !== 'indexeddb') fail('Ingen verifierad primär att exportera.');
   const baselineInput = D.parse(active.backup.payload), changes = deltas(active.baseline, active.state);
   const newSessions = { format: 'lexl-new-sessions-review-v1', schemaVersion: 1, sourceRevision: active.revision, sessions: active.state.history.filter(h => changes.added.includes(h.sessionId)) };
   const files = {
    'indexeddb-01115.json': active.stateRaw,
    'localstorage-original-01114.json': baselineInput.legacyRaw===null?'null':baselineInput.legacyRaw,
    'new-sessions-review.json': JSON.stringify(newSessions)
   };
   if(unsavedRaw!==null){D.prepare(D.parse(unsavedRaw));files['unsaved-work.json']=unsavedRaw;}
   if (baselineInput.recoveryRaw !== null) files['draft-recovery-original.json'] = baselineInput.recoveryRaw;
   if (sourceBefore.legacyRaw !== baselineInput.legacyRaw && sourceBefore.legacyRaw !== null) files['localstorage-current-raw.json'] = sourceBefore.legacyRaw;
   if (sourceBefore.recoveryRaw !== baselineInput.recoveryRaw && sourceBefore.recoveryRaw !== null) files['draft-recovery-current-raw.json'] = sourceBefore.recoveryRaw;
   const entries = [];
   for (const [name, text] of Object.entries(files)) entries.push({ name, sha256: await hash(text), utf8Bytes: new TextEncoder().encode(text).byteLength });
   const manifest = { format: 'lexl-rollback-manifest-v1', schemaVersion: 1, revision: active.revision, proposalId: active.marker.proposalId, originalMissing:baselineInput.legacyRaw===null, containsUnsavedWork:unsavedRaw!==null, sourceSnapshot:{legacyMissing:sourceBefore.legacyRaw===null,recoveryMissing:sourceBefore.recoveryRaw===null}, legacyChanged: active.legacyChanged, changes, files: entries,
    warning: '0.11.14 läser endast sitt localStorage-original. Nya pass finns i IndexedDB och dessa exporter. Importera inte 0.11.15-filer i 0.11.14. Ingen konvertering eller synkning har utförts.' };
   if (!equal(sources(), sourceBefore)) fail('Legacy-källan ändrades under exporten. Gör om exporten.');
   const bundle = { manifestText: JSON.stringify(manifest, null, 2), files };
   await verifyBundle(bundle);
   if((await read(['current'])).current?.raw!==active.stateRaw||!equal(sources(),sourceBefore))fail('Data ändrades under exporten. Gör om exporten.');
   return bundle;
  }
  return { prepare, review, confirm, inspect, commit, exportBeforeRollback, verifyBundle, exportPreparedBackup:async id=>JSON.stringify((await proposal(id)).backup,null,2), readPrimaryRaw:async()=>{const row=(await read(['current'])).current;return row===undefined?null:row.raw}, recoveryRaw:async(which='previous')=>{const name=which==='original'?'original':'previous';const rows=await read([name,'backup-receipt:'+name]);
   if(rows[name]?.format==='lexl-raw-backup-v1'){
    const active=await inspect();if(active.primary!=='indexeddb')fail('Äldre backup kräver verifierad aktivering.');
    const legacyRaw=D.parse(active.backup.payload).legacyRaw;
    const revision=rows[name].raw===null?null:D.parse(rows[name].raw).storageRevision;
    const stateReceipt=Number.isSafeInteger(revision)?(await read(['receipt:'+revision]))['receipt:'+revision]:null;
    return D.verifyRecovery(rows[name],null,{legacyRaw,stateReceipt});
   }
   return D.verifyRecovery(rows[name],rows['backup-receipt:'+name]);}, close() { writer?.close(); db?.close(); db = null; closed=true; } };
 }
 async function verifyBundle({ manifestText, files }) {
  const manifest = D.parse(manifestText);
  const allowed = ['indexeddb-01115.json', 'localstorage-original-01114.json', 'new-sessions-review.json', 'draft-recovery-original.json', 'localstorage-current-raw.json', 'draft-recovery-current-raw.json','unsaved-work.json'];
  if (manifest.format !== 'lexl-rollback-manifest-v1' || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !files || typeof files !== 'object') fail('Ogiltigt exportmanifest.');
  const names = manifest.files.map(f => f.name);
  if (new Set(names).size !== names.length || names.some(n => !allowed.includes(n)) || Object.keys(files).length !== names.length) fail('Ogiltig fillista.');
  for (const name of allowed.slice(0, 3)) if (!names.includes(name)) fail('En obligatorisk säkerhetskopia saknas.');
  for (const file of manifest.files) {
   const text = files[file.name];
   if (typeof text !== 'string' || await hash(text) !== file.sha256 || new TextEncoder().encode(text).byteLength !== file.utf8Bytes) fail('Exportfilen kunde inte verifieras: ' + file.name);
  }
  const native = D.importData(files['indexeddb-01115.json']);
  const baseline=manifest.originalMissing===true?D.prepare({programs:[],history:[],draft:null}):D.importData(files['localstorage-original-01114.json']);
  if(manifest.originalMissing===true&&files['localstorage-original-01114.json']!=='null')fail('Felaktigt tomt original.');
  if(!!manifest.containsUnsavedWork!==Object.prototype.hasOwnProperty.call(files,'unsaved-work.json'))fail('Osparat arbete stämmer inte med manifestet.');
  if(files['unsaved-work.json'])D.prepare(D.parse(files['unsaved-work.json']));
  const snapshot=manifest.sourceSnapshot;
  if(!snapshot||typeof snapshot.legacyMissing!=='boolean'||typeof snapshot.recoveryMissing!=='boolean')fail('Källbilden saknas i manifestet.');
  const originalLegacy=manifest.originalMissing?null:files['localstorage-original-01114.json'],originalRecovery=files['draft-recovery-original.json']??null;
  const currentLegacy=snapshot.legacyMissing?null:files['localstorage-current-raw.json']??originalLegacy,currentRecovery=snapshot.recoveryMissing?null:files['draft-recovery-current-raw.json']??originalRecovery;
  if((!snapshot.legacyMissing&&currentLegacy===null)||(!snapshot.recoveryMissing&&currentRecovery===null)||(snapshot.legacyMissing&&files['localstorage-current-raw.json']!==undefined)||(snapshot.recoveryMissing&&files['draft-recovery-current-raw.json']!==undefined)||manifest.legacyChanged!==(currentLegacy!==originalLegacy||currentRecovery!==originalRecovery))fail('Manifestets källbild stämmer inte.');
  const review = D.parse(files['new-sessions-review.json']), changes = deltas(baseline, native);
  if (manifest.revision !== native.storageRevision || review.format !== 'lexl-new-sessions-review-v1' || review.schemaVersion !== 1 || review.sourceRevision !== native.storageRevision || !equal(manifest.changes, changes) || !equal(review.sessions, native.history.filter(h => changes.added.includes(h.sessionId)))) fail('Exportens revision eller nya pass stämmer inte.');
  if (files['draft-recovery-original.json']) decodeSources(manifest.originalMissing?null:files['localstorage-original-01114.json'], files['draft-recovery-original.json']);
  return { verified: true, revision: manifest.revision, newSessions: changes.added.length, changedSessions: changes.changed.length, removedSessions: changes.removed.length };
 }
 root.LEXLTransition = { create, verifyBundle };
})(globalThis);
