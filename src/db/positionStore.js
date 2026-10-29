// 브라우저 IndexedDB 에 ISS 좌표를 저장/조회/정리하는 작은 래퍼
const DB_NAME = 'iss-tracker';
const DB_VERSION = 1;
const STORE = 'positions';

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // 키: 측정 시각(ms). 같은 timestamp 가 다시 오면 덮어써서 중복을 막는다.
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'ts' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function run(mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        work(store, (value) => (result = value));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** cutoff(ms) 보다 오래된 좌표 삭제 */
export function deleteOlderThan(cutoff) {
  return run('readwrite', (store) => {
    store.delete(IDBKeyRange.upperBound(cutoff, true));
  });
}

/** 좌표 저장과 동시에 오래된 좌표 정리 */
export function savePosition(position, cutoff) {
  return run('readwrite', (store) => {
    store.put(position);
    store.delete(IDBKeyRange.upperBound(cutoff, true));
  });
}

/** cutoff(ms) 이후 좌표를 시간순으로 조회 (조회 전에 오래된 좌표 삭제) */
export async function loadPositionsSince(cutoff) {
  await deleteOlderThan(cutoff);
  return run('readonly', (store, setResult) => {
    const req = store.getAll(IDBKeyRange.lowerBound(cutoff));
    req.onsuccess = () => setResult(req.result);
  });
}
