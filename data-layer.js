/* LEXL 0.11.15, stage 1. No DOM, result calculations or implicit name matching. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LEXLData = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const SCHEMA_VERSION = 1;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const CALCULATION_VERSION = '0.11.14';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  const id = v => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,240}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
  const safeGroup = v => v == null || v === '' || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) ||
    (typeof v === 'string' && v.length <= 240 && !['__proto__', 'prototype', 'constructor'].includes(v) && !/[\u0000-\u001f\u2028\u2029'"<>&\\]/.test(v));
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
  function safeTree(value, depth = 0, budget = { count: 0 }) {
    if (++budget.count > 500000 || depth > 32) fail('Datastrukturen är för stor eller för djup.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (!object(value) && !Array.isArray(value)) fail('Ogiltigt JSON-värde.');
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Ogiltigt objekt.');
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('Otillåten objektnyckel.');
      safeTree(value[key], depth + 1, budget);
    }
  }
  function parse(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_FILE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_FILE_BYTES) fail('Ogiltig eller för stor JSON-fil.');
    const value = JSON.parse(raw);
    safeTree(value);
    return value;
  }
  function unique(values, label) {
    if (values.some(v => !id(v)) || new Set(values).size !== values.length) fail('Ogiltiga eller dubbla ' + label + '.');
  }
  function validate(input, complete = true) {
    safeTree(input);
    if (!object(input) || !Array.isArray(input.programs) || !Array.isArray(input.history)) fail('Program och historik måste vara listor.');
    if (own(input, 'schemaVersion') && input.schemaVersion !== SCHEMA_VERSION) fail('Schemaversionen stöds inte.');
    if (own(input, 'calculationVersion') && !['legacy-unknown', CALCULATION_VERSION].includes(input.calculationVersion)) fail('Beräkningsversionen stöds inte.');
    if (own(input, 'storageRevision') && (!Number.isSafeInteger(input.storageRevision) || input.storageRevision < 0)) fail('Ogiltig lagringsrevision.');
    unique(input.programs.map(p => p?.id), 'program-ID:n');
    for (const p of input.programs) {
      if (!object(p) || typeof p.name !== 'string' || !Array.isArray(p.exercises)) fail('Ogiltigt program.');
      if (p.programId !== undefined && p.programId !== p.id) fail('Program-ID stämmer inte.');
      if (p.rounds !== undefined && (!Number.isInteger(Number(p.rounds)) || Number(p.rounds) < 1)) fail('Ogiltigt antal varv.');
      unique(p.exercises.map(e => e?.id), 'övningsplatser');
      for (const e of p.exercises) {
        if (!object(e) || typeof e.name !== 'string') fail('Ogiltig övning.');
        if (e.sets !== undefined && (!Number.isInteger(Number(e.sets)) || Number(e.sets) < 1)) fail('Ogiltigt antal set.');
        if (!safeGroup(e.circleGroup)) fail('Ogiltig cirkelidentitet.');
        if (e.exerciseId !== undefined && !id(e.exerciseId)) fail('Ogiltig övningsidentitet.');
        if (e.slotId !== undefined && !id(e.slotId)) fail('Ogiltig platsidentitet.');
        if (e.alternatives !== undefined) {
          if (!Array.isArray(e.alternatives)) fail('Alternativ måste vara en lista.');
          for (const a of e.alternatives) {
            if (!object(a) || typeof a.name !== 'string' || (a.exerciseId !== undefined && !id(a.exerciseId)) || (a.alternativeId !== undefined && !id(a.alternativeId))) fail('Ogiltig alternatividentitet.');
          }
        }
      }
    }
    function record(h, draft) {
      if (!object(h) || typeof h.name !== 'string' || !Array.isArray(h.rows)) fail('Ogiltigt träningspass.');
      for (const r of h.rows) {
        if (!object(r) || typeof r.name !== 'string' || (r.id !== undefined && !id(r.id))) fail('Ogiltig träningsrad.');
        for (const k of ['weight', 'weightPress', 'reps', 'set']) if (r[k] != null && !['string', 'number'].includes(typeof r[k])) fail('Ogiltigt träningsvärde.');
        if (r.done !== undefined && typeof r.done !== 'boolean') fail('Ogiltig markering för genomfört set.');
        for (const k of ['exerciseId', 'slotId']) if (r[k] != null && !id(r[k])) fail('Ogiltig radidentitet.');
      }
      for (const k of ['totalMinutes', 'warmupMinutes', 'pausedMinutes', 'manualTotalMinutes']) if (h[k] != null && !['string', 'number'].includes(typeof h[k])) fail('Ogiltig träningssumma.');
      for (const k of ['date', 'started', 'recordedAt']) if (h[k] != null && typeof h[k] !== 'string') fail('Ogiltigt historiskt datumfält.');
      if (h.sessionId !== undefined && !id(h.sessionId)) fail('Ogiltigt pass-ID.');
      if (h.programId != null && !id(h.programId)) fail('Ogiltigt program-ID för pass.');
      if (h.workoutDate != null && !date(h.workoutDate)) fail('Ogiltigt träningsdatum.');
      if (h.warmup !== undefined && (!Array.isArray(h.warmup) || h.warmup.some(w => !object(w)))) fail('Ogiltig uppvärmning.');
      for (const k of ['comments', 'circleGroups']) {
        if (h[k] !== undefined && !object(h[k])) fail('Ogiltiga kommentarer eller cirkelkopplingar.');
        if (h[k] !== undefined && Object.values(h[k]).some(v => typeof v !== 'string')) fail('Ogiltigt kommentar- eller cirkelvärde.');
      }
      if (draft && !id(h.id)) fail('Utkastets program-ID saknas.');
    }
    input.history.forEach(h => record(h, false));
    if (input.draft != null) record(input.draft, true);
    if (complete && input.schemaVersion === SCHEMA_VERSION) {
      unique(input.history.map(h => h.sessionId), 'pass-ID:n');
      unique(input.programs.flatMap(p => p.exercises.map(e => e.slotId)), 'globala plats-ID:n');
      for (const p of input.programs) for (const e of p.exercises) {
        if (!id(e.exerciseId)) fail('Global övningsidentitet saknas.');
        unique((e.alternatives || []).map(a => a.alternativeId), 'alternativ-ID:n');
        for (const a of e.alternatives || []) if (!id(a.exerciseId) || a.exerciseId === e.exerciseId) fail('Alternativets separata övningsidentitet saknas.');
      }
    }
    return input;
  }
  // Stable content fingerprint for legacy metadata, never for matching exercise names.
  function fingerprint(text) {
    let a = 2166136261, b = 2246822507;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 3266489909); }
    return (a >>> 0).toString(16) + (b >>> 0).toString(16);
  }
  const legacyKey = (...parts) => fingerprint(JSON.stringify(parts));
  function legacyDate(h) {
    // A timestamp does not establish the originally intended calendar date.
    // Preserve the existing timestamp and let legacy rendering keep its old timezone semantics.
    return date(h.date) ? h.date : null;
  }
  function prepare(input) {
    validate(input, false);
    const next = copy(input), legacy = !own(input, 'schemaVersion');
    for (const p of next.programs) {
      p.programId ??= p.id;
      for (const e of p.exercises) {
        e.slotId ??= 'slot:' + legacyKey(p.id, e.id);
        // A legacy placement identifies only its own lineage, not similarly named exercises.
        e.exerciseId ??= 'legacy-exercise:' + legacyKey(p.id, e.id);
        e.identitySource ??= 'legacy-placement';
        e.alternatives ??= [];
        e.alternatives.forEach((a, i) => {
          a.alternativeId ??= 'alternative:' + legacyKey(e.slotId, i);
          a.exerciseId ??= 'legacy-alternative:' + legacyKey(e.slotId, i);
        });
      }
    }
    function decorate(h, index, draft) {
      const original = copy(h);
      h.sessionId ??= 'legacy-session:' + index + ':' + fingerprint(JSON.stringify(original));
      if (!own(h, 'programId')) h.programId = id(h.id) ? h.id : null;
      if (!own(h, 'workoutDate')) h.workoutDate = legacyDate(h);
      h.workoutDateSource ??= h.workoutDate ? (original.workoutDate ? 'explicit' : 'legacy-date-only') : 'unknown';
      h.calculationVersion ??= 'legacy-unknown';
      h.recordedAt ??= null; // Legacy date may be a training date; do not invent a registration time.
      h.snapshot ??= { source: 'legacy-record', record: original };
      const p = next.programs.find(p => p.id === h.programId);
      for (const r of h.rows) {
        const matches = p ? p.exercises.filter(e => e.id === r.id) : [];
        // History without an explicit program ID remains unmapped. No name fallback.
        if (!own(r, 'slotId')) r.slotId = matches.length === 1 ? matches[0].slotId : null;
        if (!own(r, 'exerciseId')) r.exerciseId = matches.length === 1 ? matches[0].exerciseId : null;
      }
      if (draft) { h.warmup ??= []; h.comments ??= {}; h.circleGroups ??= {}; }
    }
    next.history.forEach((h, i) => decorate(h, i, false));
    if (next.draft) decorate(next.draft, 'draft', true);
    next.schemaVersion = SCHEMA_VERSION;
    next.calculationVersion ??= legacy ? 'legacy-unknown' : CALCULATION_VERSION;
    next.storageRevision ??= 0;
    next.draft ??= null;
    return validate(next);
  }
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function exportData(state) {
    const text = JSON.stringify(prepare(state), null, 2);
    if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) fail('Exporten är för stor för säker återimport.');
    return text;
  }
  function importData(raw) { const value = parse(raw); validate(value); return prepare(value); }
  function duplicateProgram(program, uuid) {
    const p = copy(program);
    p.id = uuid(); p.programId = p.id; p.name += ' (kopia)';
    p.exercises.forEach(e => { e.id = uuid(); e.slotId = e.id; (e.alternatives || []).forEach(a => { a.alternativeId = uuid(); }); });
    return p;
  }
  function newSession(program, uuid, now, workoutDate) {
    return { sessionId: uuid(), programId: program.id, recordedAt: now,
      workoutDate, workoutDateSource: 'explicit', calculationVersion: CALCULATION_VERSION,
      programSnapshot: copy(program) };
  }
  function rowMatches(record, row, program, exercise) {
    if (record.programId !== program.id) return false;
    return row.slotId === exercise.slotId && row.exerciseId === exercise.exerciseId;
  }
  // All training-data writes are confined to IndexedDB. localStorage is read-only.
  // Existing legacy data require an explicit file import before IndexedDB activation.
  function createStore({ storage, legacyKey, experimentalKey = null, defaults,
    dbName = 'lexl-training-schema1', getIndexedDB = () => globalThis.indexedDB,
    onChange = () => {} }) {
    const RECORD_FORMAT = 'lexl-idb-state-v1', BACKUP_FORMAT = 'lexl-raw-backup-v1';
    let raw = null, legacyRaw = null, nativeRaw = null, nativeRevision = 0;
    let state = null, blocked = null, initialized = false, source = 'loading', db = null;
    let channel = null, experimentalRaw = null;
    try {
      legacyRaw = storage.getItem(legacyKey);
      experimentalRaw = experimentalKey ? storage.getItem(experimentalKey) : null;
      raw = experimentalRaw === null ? legacyRaw : experimentalRaw;
      state = freeze(prepare(raw === null ? { ...defaults(), calculationVersion: CALCULATION_VERSION } : parse(raw)));
    } catch (error) { blocked = error; }
    const conflict = () => new Error('Data har ändrats i ett annat appfönster. Exportera osparat arbete och ladda om innan du fortsätter.');
    function decodeRecord(record) {
      if (!object(record) || record.format !== RECORD_FORMAT || typeof record.raw !== 'string' ||
          !Number.isSafeInteger(record.revision) || record.revision < 1 ||
          (record.legacyRaw !== null && typeof record.legacyRaw !== 'string')) fail('Ogiltig IndexedDB-post.');
      const value = prepare(parse(record.raw));
      if (value.storageRevision !== record.revision) fail('Lagringsrevisionerna stämmer inte.');
      return value;
    }
    function decodeBackup(record) {
      if (!object(record) || record.format !== BACKUP_FORMAT || (record.raw !== null && typeof record.raw !== 'string')) fail('Ogiltig återställningskopia.');
      if (record.raw !== null) {
        try { validate(parse(record.raw)); }
        catch (error) { fail('Återställningskopian kunde inte valideras: ' + error.message); }
      }
      return record.raw;
    }
    function openDatabase() {
      return new Promise((resolve, reject) => {
        let request, settled = false;
        const bad = error => { if (!settled) { settled = true; reject(error); } };
        try {
          const factory = getIndexedDB();
          if (!factory) return bad(new Error('IndexedDB är inte tillgängligt. Ingen reservskrivning till localStorage görs.'));
          request = factory.open(dbName, 1);
          request.onupgradeneeded = () => { request.result.createObjectStore('records'); };
          request.onerror = () => bad(request.error || new Error('IndexedDB kunde inte öppnas.'));
          request.onblocked = () => bad(new Error('IndexedDB är blockerad av ett annat appfönster. Stäng det och ladda om.'));
          request.onsuccess = () => {
            if (settled) { request.result.close(); return; }
            settled = true;
            const connection = request.result;
            connection.onversionchange = () => { connection.close(); blocked = new Error('Databasversionen har ändrats. Ladda om appen.'); onChange(blocked.message); };
            connection.onclose = () => { blocked = new Error('Databasanslutningen stängdes. Ladda om appen.'); onChange(blocked.message); };
            resolve(connection);
          };
        } catch (error) { bad(error); }
      });
    }
    function readRecords(keys) {
      return new Promise((resolve, reject) => {
        let tx;
        const result = {};
        try {
          tx = db.transaction('records', 'readonly');
          for (const key of keys) {
            const request = tx.objectStore('records').get(key);
            request.onsuccess = () => { result[key] = request.result; };
          }
          tx.oncomplete = () => resolve(result);
          tx.onabort = () => reject(tx.error || new Error('Lästransaktionen avbröts.'));
          tx.onerror = () => {}; // onabort owns rejection; never suppress the abort.
        } catch (error) { if (tx) try { tx.abort(); } catch {} reject(error); }
      });
    }
    const ready = (async () => {
      try {
        db = await openDatabase();
        const record = (await readRecords(['current'])).current;
        if (record !== undefined) {
          // A damaged primary must never silently fall back to legacy data.
          state = null;
          raw = typeof record?.raw === 'string' ? record.raw : JSON.stringify(record);
          const loaded = decodeRecord(record);
          state = freeze(loaded); nativeRaw = record.raw; nativeRevision = record.revision;
          source = 'indexeddb';
          if (record.legacyRaw !== legacyRaw) fail('Äldre localStorage-data har ändrats sedan aktiveringen. Båda källorna bevaras; exportera dem för granskning.');
          // A damaged legacy source does not invalidate an otherwise readable primary,
          // but its earlier read/validation error still blocks further writing.
        } else {
          source = experimentalRaw !== null ? 'experimental-readonly' : legacyRaw === null ? 'first-start' : 'legacy-readonly';
          if (experimentalRaw !== null) fail('Ett tidigare experimentellt tillstånd finns i localStorage. Det bevaras skrivskyddat och kräver granskning före import.');
        }
        if (typeof BroadcastChannel === 'function') {
          channel = new BroadcastChannel(dbName + ':changes');
          channel.onmessage = event => { if (event.data?.revision !== nativeRevision) onChange(conflict().message); };
        }
      } catch (error) { blocked = error; }
      initialized = true;
    })();
    async function commit(candidate, { intent = 'change' } = {}) {
      // Freeze the proposed change before yielding; caller mutations cannot affect it.
      const next = prepare(candidate);
      await ready;
      if (blocked) fail('Skrivning blockerad: ' + blocked.message);
      if (source === 'legacy-readonly' && intent !== 'import') fail('Äldre data är skrivskyddade. Exportera en säkerhetskopia och importera den uttryckligen för att använda IndexedDB. Originalet i localStorage ändras inte.');
      if (next.storageRevision !== state.storageRevision) fail('Ändringen bygger på ett äldre tillstånd. Ladda om innan du fortsätter.');
      if (storage.getItem(legacyKey) !== legacyRaw) throw conflict();
      const expectedRaw = nativeRaw, expectedRevision = nativeRevision, previousRaw = raw;
      next.storageRevision = expectedRevision + 1;
      if (!Number.isSafeInteger(next.storageRevision)) fail('Revisionsnumret kan inte ökas säkert.');
      const text = JSON.stringify(next);
      if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) fail('Tillståndet är för stort för säker återimport.');
      if (!globalThis.crypto?.randomUUID || !globalThis.crypto?.subtle) fail('Säker lagring kräver kryptografiskt stöd och en säker anslutning.');
      const token = globalThis.crypto.randomUUID();
      const receiptKey = 'receipt:' + next.storageRevision;
      // Receipt hashing happens outside the write transaction (no async gaps inside it).
      const bytes = new TextEncoder().encode(text);
      const digest = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
      const proposed = { format: RECORD_FORMAT, revision: next.storageRevision, raw: text, legacyRaw };
      const backup = { format: BACKUP_FORMAT, raw: previousRaw };
      await new Promise((resolve, reject) => {
        let tx, cause;
        const abort = error => { cause = error; try { tx.abort(); } catch {} };
        try {
          tx = db.transaction('records', 'readwrite', { durability: 'strict' });
          const records = tx.objectStore('records');
          tx.onabort = () => reject(cause || tx.error || new Error('Skrivtransaktionen avbröts. Tidigare data bevaras.'));
          tx.onerror = () => {}; // Request failures must abort the complete transaction.
          tx.oncomplete = resolve;
          const current = records.get('current');
          current.onsuccess = () => {
            try {
              const actual = current.result;
              if (actual !== undefined) { decodeRecord(actual); if (actual.legacyRaw !== legacyRaw) throw conflict(); }
              if (actual === undefined ? expectedRaw !== null : actual.revision !== expectedRevision || actual.raw !== expectedRaw) throw conflict();
              if (storage.getItem(legacyKey) !== legacyRaw) throw conflict();
              const original = records.get('original');
              original.onsuccess = () => {
                try {
                  if (original.result === undefined) records.put(backup, 'original');
                  else decodeBackup(original.result);
                  records.put(backup, 'previous');
                  records.put(proposed, 'current');
                  records.put({ revision: next.storageRevision, token, digest }, receiptKey);
                  if (next.storageRevision > 32) records.delete('receipt:' + (next.storageRevision - 32));
                  // Read back exact data and backups in this same atomic transaction.
                  const check = records.get('current');
                  check.onsuccess = () => {
                    try { if (check.result?.raw !== text || check.result?.revision !== next.storageRevision) fail('Skrivningen kunde inte verifieras.'); decodeRecord(check.result); }
                    catch (error) { abort(error); }
                  };
                  for (const key of ['original', 'previous']) {
                    const checkBackup = records.get(key);
                    checkBackup.onsuccess = () => { try { decodeBackup(checkBackup.result); if (key === 'previous' && checkBackup.result.raw !== previousRaw) fail('Återställningskopian kunde inte verifieras.'); } catch (error) { abort(error); } };
                  }
                } catch (error) { abort(error); }
              };
            } catch (error) { abort(error); }
          };
        } catch (error) { if (tx) abort(error); else reject(error); }
      });
      // oncomplete, not a successful put, proves commit. Verify its receipt in a
      // fresh readonly transaction, even if another tab has since saved revision N+1.
      try {
        const verified = await readRecords([receiptKey, 'current']);
        const receipt = verified[receiptKey];
        if (receipt?.token !== token || receipt.digest !== digest || receipt.revision !== next.storageRevision) fail('Transaktionens kvitto kunde inte verifieras.');
        const current = verified.current;
        decodeRecord(current);
        if (current.revision < next.storageRevision || (current.revision === next.storageRevision && current.raw !== text)) fail('Det sparade tillståndet kunde inte verifieras.');
      } catch (error) {
        // Never roll back here: that could overwrite a later tab's valid commit.
        blocked = new Error('Transaktionen slutfördes men efterkontrollen misslyckades. Ändringen kan vara sparad. Exportera osparat arbete och ladda om: ' + error.message);
        throw blocked;
      }
      raw = text; nativeRaw = text; nativeRevision = next.storageRevision;
      state = freeze(next); source = 'indexeddb';
      try { channel?.postMessage({ revision: nativeRevision }); } catch {}
      return state;
    }
    async function recoveryRaw(which = 'previous') {
      await ready;
      if (!db) fail('IndexedDB är inte tillgängligt.');
      const name = which === 'original' ? 'original' : 'previous';
      return decodeBackup((await readRecords([name]))[name]);
    }
    async function readPrimaryRaw() {
      await ready;
      if (!db) fail('IndexedDB är inte tillgängligt.');
      const record = (await readRecords(['current'])).current;
      return record === undefined ? null : record.raw;
    }
    return { ready, commit, recoveryRaw, readPrimaryRaw,
      get state() { return state; }, get blocked() { return blocked; }, get raw() { return raw; },
      get legacyRaw() { return legacyRaw; }, get initialized() { return initialized; }, get source() { return source; },
      close() { channel?.close(); db?.close(); } };
  }
  return { SCHEMA_VERSION, CALCULATION_VERSION, copy, freeze, parse, validate, prepare,
    exportData, importData, duplicateProgram, newSession, rowMatches, createStore, date };
});
