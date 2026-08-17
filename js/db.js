// ===== 本地数据层：IndexedDB 封装 =====
// 库结构：
//   trips:      行程 {id, title, createdAt, startDate, startHour, points:[{uid,name,lat,lng,type,stayMin,importance,note,parking:[],parkingFetchedAt}], order手动调整, plan:[], advice:[], plannedAt}
//   diaries:    日记 {id, tripId, ts, text, photos:[dataURL], place, tags:[], lat, lng}
//   meta:       杂项 kv
RB.DB = (function () {
  const DB_NAME = 'roadbook', DB_VER = 1;
  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('trips')) {
          const s = d.createObjectStore('trips', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
        if (!d.objectStoreNames.contains('diaries')) {
          const s = d.createObjectStore('diaries', { keyPath: 'id' });
          s.createIndex('tripId', 'tripId');
        }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = e => rej(e.target.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      let out;
      try { out = fn(s); } catch (err) { rej(err); return; }
      // out 为 IDBRequest（put/get/delete 等）→ 取 request.result；否则原样返回
      t.oncomplete = () => res((typeof IDBRequest !== 'undefined' && out instanceof IDBRequest) ? out.result : out);
      t.onerror = () => rej(t.error);
    }));
  }

  // ---- trips ----
  function newTrip(data) {
    const rec = Object.assign({
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(), startDate: '', startHour: 8, points: [], plan: [], advice: []
    }, data);
    return tx('trips', 'readwrite', s => s.put(rec)).then(() => rec);
  }

  const saveTrip = t => tx('trips', 'readwrite', s => s.put(t)).then(() => t);
  const getTrip = id => tx('trips', 'readonly', s => s.get(id));
  const listTrips = () => tx('trips', 'readonly', s => s.getAll()).then(ts => ts.sort((a, b) => b.createdAt - a.createdAt));
  const delTrip = id => tx('trips', 'readwrite', s => s.delete(id));

  // ---- diaries ----
  const newDiary = d => tx('diaries', 'readwrite', s => s.put(Object.assign({
    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(), text: '', photos: [], place: '', tags: [], lat: null, lng: null
  }, d)));

  const listDiaries = tripId => tx('diaries', 'readonly', s => tripId ? s.index('tripId').getAll(tripId) : s.getAll())
    .then(ds => ds.sort((a, b) => b.ts - a.ts));
  const saveDiary = d => tx('diaries', 'readwrite', s => s.put(d)).then(() => d);
  const delDiary = id => tx('diaries', 'readwrite', s => s.delete(id));

  // ---- 备份导出/导入 ----
  async function exportAll() {
    const trips = await listTrips();
    const diaries = await tx('diaries', 'readonly', s => s.getAll());
    return { app: 'roadbook', ver: 1, exportedAt: new Date().toISOString(), trips, diaries };
  }
  async function importAll(json, mode = 'merge') {
    if (json.app !== 'roadbook') throw new Error('不是自驾路书备份文件');
    let nTrip = 0, nDiar = 0;
    for (const t of (json.trips || [])) { await saveTrip(t); nTrip++; }
    for (const d of (json.diaries || [])) { await saveDiary(d); nDiar++; }
    return { nTrip, nDiar };
  }

  return { newTrip, saveTrip, getTrip, listTrips, delTrip, newDiary, listDiaries, saveDiary, delDiary, exportAll, importAll };
})();
