/* Isolated stage-1 investigation. NOT loaded by index.html or the service worker.
 * No default localStorage adapter. Only explicitly named prototype databases.
 */
(function (root) {
 'use strict';
 const D = root.LEXLData;
 const fail = message => { throw new Error(message); };
 const hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
 const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
 const canonical = value => JSON.stringify(sort(value));
 function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
 function decodeSources(legacyRaw, recoveryRaw) {
  if (typeof legacyRaw !== 'string') fail('Befintliga legacy-data saknas.');
  const state = D.importData(legacyRaw);
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
 function create({ dbName, readLegacy, readRecovery = () => null }) {
  if (!D || !/^lexl-prototype-[a-zA-Z0-9-]+$/.test(dbName || '') || typeof readLegacy !== 'function') fail('Endast explicit konfigurerad, isolerad prototyp är tillåten.');
  let db;
  const sources = () => ({ legacyRaw: readLegacy(), recoveryRaw: readRecovery() });
  const open = async () => {
   if (db) return db;
   db = await new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('records');
    r.onblocked = () => reject(Error('Prototypdatabasen är blockerad.'));
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
   });
   return db;
  };
  async function read(keys) {
   const connection = await open();
   return new Promise((resolve, reject) => {
    const tx = connection.transaction('records', 'readonly'), result = {};
    for (const key of keys) { const r = tx.objectStore('records').get(key); r.onsuccess = () => { result[key] = r.result; }; }
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
   const input = D.parse(backup.payload);
   const state = decodeSources(input.legacyRaw, input.recoveryRaw);
   return { input, state };
  }
  async function proposal(id) {
   if (typeof id !== 'string' || !/^[a-zA-Z0-9-]+$/.test(id)) fail('Ogiltigt övergångs-ID.');
   const pkey = 'proposal:' + id, bkey = 'backup:' + id;
   const rows = await read([pkey, bkey, 'activation', 'copy-owner', 'current']);
   const p = rows[pkey], backup = rows[bkey];
   const verified = await validateBackup(backup);
   if (p?.format !== 'lexl-transition-proposal-v1' || p.id !== id || p.backupSha256 !== backup.sha256 || typeof p.copyRaw !== 'string') fail('Övergångsförslaget är ogiltigt.');
   const expected = D.copy(verified.state); expected.storageRevision = 1;
   if (p.copyRaw !== JSON.stringify(expected) || p.copySha256 !== await hash(p.copyRaw)) fail('Den planerade kopian har ändrats.');
   return { p, backup, ...verified, rows, pkey, bkey };
  }
  async function prepare() {
   const input = sources(), state = decodeSources(input.legacyRaw, input.recoveryRaw);
   const current = (await read(['current', 'activation', 'copy-owner']));
   if (current.current || current.activation || current['copy-owner']) fail('En kopia eller övergång finns redan. Den får inte skrivas över.');
   const id = crypto.randomUUID(), payload = JSON.stringify(input);
   const backup = { format: 'lexl-transition-backup-v1', payload, sha256: await hash(payload), createdAt: new Date().toISOString() };
   const target = D.copy(state); target.storageRevision = 1;
   const p = { format: 'lexl-transition-proposal-v1', id, backupSha256: backup.sha256, copyRaw: JSON.stringify(target), copySha256: await hash(JSON.stringify(target)), approved: false };
   await guarded(['current', 'activation', 'copy-owner'], (records, found) => {
    if (found.current || found.activation || found['copy-owner'] || !equal(sources(), input)) fail('Källan eller målet har ändrats.');
    records.add(backup, 'backup:' + id); records.add(p, 'proposal:' + id);
   });
   // The backup is committed and read back BEFORE any consent or primary copy.
   const verified = await proposal(id);
   if (!equal(verified.input, input) || !equal(sources(), input)) fail('Källan ändrades under förberedelsen. Ingen primär har aktiverats.');
   return D.freeze({ id, backupSha256: backup.sha256, programs: state.programs.length, sessions: state.history.length, draft: !!state.draft, recovery: input.recoveryRaw !== null, primaryActivated: false });
  }
  async function confirm(id, { approved, backupSha256 } = {}) {
   if (approved !== true) fail('Uttryckligt godkännande saknas.');
   const item = await proposal(id), { p, input, rows } = item;
   if (backupSha256 !== p.backupSha256) fail('Godkännandet avser inte den verifierade kopian.');
   if (!equal(sources(), input)) fail('Legacy-källan har ändrats. Ingen övergång aktiveras.');
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
   const store = D.createStore({ dbName, legacyKey: 'synthetic-source', storage: { getItem: () => readLegacy() }, defaults: () => ({ programs: [], history: [], draft: null }) });
   try {
    await store.ready;
    if (store.blocked) throw store.blocked;
    const current = await store.readPrimaryRaw();
    if (current === null) await store.commit(D.copy(item.state), { intent: 'import' });
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
   const first = await read(['activation', 'current', 'copy-owner']);
   if (!first.activation) return { primary: 'legacy-readonly', copiedButInactive: !!first.current, pendingProposalId: first['copy-owner']?.proposalId || null };
   const marker = first.activation;
   if (marker.format !== 'lexl-transition-activation-v1' || marker.revision !== 1) fail('Ogiltig aktiveringsmarkör.');
   // One snapshot of current + consent + backup + activation; no mixed revisions.
   const snapshot = await read(['activation', 'current', 'proposal:' + marker.proposalId, 'backup:' + marker.proposalId]);
   const p = snapshot['proposal:' + marker.proposalId], backup = snapshot['backup:' + marker.proposalId], current = snapshot.current;
   const verified = await validateBackup(backup);
   const planned = D.copy(verified.state); planned.storageRevision = 1;
   const expectedCopy = JSON.stringify(planned);
   if (p?.format !== 'lexl-transition-proposal-v1' || p.id !== marker.proposalId || p.copyRaw !== expectedCopy || marker.copySha256 !== await hash(expectedCopy)) fail('Övergångsunderlaget kunde inte verifieras.');
   const state = D.importData(current?.raw);
   if (!equal(snapshot.activation, marker) || !p?.approved || marker.backupSha256 !== backup.sha256 || marker.copySha256 !== p.copySha256 || current.format !== 'lexl-idb-state-v1' || current.revision !== state.storageRevision || state.storageRevision < marker.revision || current.legacyRaw !== verified.input.legacyRaw) fail('Aktiveringen kunde inte verifieras.');
   if (current.revision === 1 && await hash(current.raw) !== marker.copySha256) fail('Den aktiverade kopian har ändrats.');
   return { primary: 'indexeddb', revision: current.revision, state, legacyChanged: !equal(sources(), verified.input), marker, backup, stateRaw: current.raw, baseline: verified.state };
  }
  async function save(mutator) {
   const active = await inspect();
   if (active.primary !== 'indexeddb' || active.legacyChanged) fail('Skrivning kräver verifierad aktivering och oförändrad legacy-källa.');
   const next = D.copy(active.state); mutator(next);
   const store = D.createStore({ dbName, legacyKey: 'synthetic-source', storage: { getItem: () => readLegacy() }, defaults: () => ({ programs: [], history: [], draft: null }) });
   try { await store.ready; return await store.commit(next); } finally { store.close(); }
  }
  async function exportBeforeRollback() {
   const sourceBefore = sources(), active = await inspect();
   if (active.primary !== 'indexeddb') fail('Ingen verifierad primär att exportera.');
   const baselineInput = D.parse(active.backup.payload), changes = deltas(active.baseline, active.state);
   const newSessions = { format: 'lexl-new-sessions-review-v1', schemaVersion: 1, sourceRevision: active.revision, sessions: active.state.history.filter(h => changes.added.includes(h.sessionId)) };
   const files = {
    'indexeddb-01115.json': active.stateRaw,
    'localstorage-original-01114.json': baselineInput.legacyRaw,
    'new-sessions-review.json': JSON.stringify(newSessions, null, 2)
   };
   if (baselineInput.recoveryRaw !== null) files['draft-recovery-original.json'] = baselineInput.recoveryRaw;
   if (sourceBefore.legacyRaw !== baselineInput.legacyRaw && sourceBefore.legacyRaw !== null) files['localstorage-current-raw.json'] = sourceBefore.legacyRaw;
   if (sourceBefore.recoveryRaw !== baselineInput.recoveryRaw && sourceBefore.recoveryRaw !== null) files['draft-recovery-current-raw.json'] = sourceBefore.recoveryRaw;
   const entries = [];
   for (const [name, text] of Object.entries(files)) entries.push({ name, sha256: await hash(text), utf8Bytes: new TextEncoder().encode(text).byteLength });
   const manifest = { format: 'lexl-rollback-manifest-v1', schemaVersion: 1, revision: active.revision, proposalId: active.marker.proposalId, legacyChanged: active.legacyChanged, changes, files: entries,
    warning: '0.11.14 läser endast sitt localStorage-original. Nya pass finns i IndexedDB och dessa exporter. Importera inte 0.11.15-filer i 0.11.14. Ingen konvertering eller synkning har utförts.' };
   if (!equal(sources(), sourceBefore)) fail('Legacy-källan ändrades under exporten. Gör om exporten.');
   const bundle = { manifestText: JSON.stringify(manifest, null, 2), files };
   await verifyBundle(bundle);
   return bundle;
  }
  return { prepare, confirm, inspect, save, exportBeforeRollback, close() { db?.close(); db = null; } };
 }
 async function verifyBundle({ manifestText, files }) {
  const manifest = D.parse(manifestText);
  const allowed = ['indexeddb-01115.json', 'localstorage-original-01114.json', 'new-sessions-review.json', 'draft-recovery-original.json', 'localstorage-current-raw.json', 'draft-recovery-current-raw.json'];
  if (manifest.format !== 'lexl-rollback-manifest-v1' || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !files || typeof files !== 'object') fail('Ogiltigt exportmanifest.');
  const names = manifest.files.map(f => f.name);
  if (new Set(names).size !== names.length || names.some(n => !allowed.includes(n)) || Object.keys(files).length !== names.length) fail('Ogiltig fillista.');
  for (const name of allowed.slice(0, 3)) if (!names.includes(name)) fail('En obligatorisk säkerhetskopia saknas.');
  for (const file of manifest.files) {
   const text = files[file.name];
   if (typeof text !== 'string' || await hash(text) !== file.sha256 || new TextEncoder().encode(text).byteLength !== file.utf8Bytes) fail('Exportfilen kunde inte verifieras: ' + file.name);
  }
  const native = D.importData(files['indexeddb-01115.json']), baseline = D.importData(files['localstorage-original-01114.json']);
  const review = D.parse(files['new-sessions-review.json']), changes = deltas(baseline, native);
  if (manifest.revision !== native.storageRevision || review.format !== 'lexl-new-sessions-review-v1' || review.schemaVersion !== 1 || review.sourceRevision !== native.storageRevision || !equal(manifest.changes, changes) || !equal(review.sessions, native.history.filter(h => changes.added.includes(h.sessionId)))) fail('Exportens revision eller nya pass stämmer inte.');
  if (files['draft-recovery-original.json']) decodeSources(files['localstorage-original-01114.json'], files['draft-recovery-original.json']);
  return { verified: true, revision: manifest.revision, newSessions: changes.added.length, changedSessions: changes.changed.length, removedSessions: changes.removed.length };
 }
 root.LEXLMigrationPrototype = { create, verifyBundle };
})(globalThis);
