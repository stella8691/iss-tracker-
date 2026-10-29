/**
 * ISS 궤도 계산 유틸리티
 *
 * TLE 없이 원궤도 근사 모델로 위치를 추정한다.
 *  - 궤도 경사각 51.64°, 공전 주기 약 92.6분
 *  - 지구 자전과 궤도면 세차(약 -5°/일)를 반영해 승교점 경도가 서쪽으로 이동
 * 실측 좌표 하나(위도, 경도, 시각)와 상승/하강 방향을 알면 궤도 위상을 결정할 수 있고,
 * 이 위상을 기준으로 앞뒤 시각의 위치를 계산한다.
 */
const DEG = Math.PI / 180;

export const TRACK_WINDOW_MS = 4 * 60 * 60 * 1000; // 최근 4시간
export const EARTH_RADIUS_KM = 6371;
export const ISS_ALTITUDE_KM = 420;

const INCLINATION = 51.64;
const ORBIT_PERIOD_S = 5556;
const MEAN_MOTION = 360 / ORBIT_PERIOD_S; // deg/s, 궤도 위상 증가 속도
const EARTH_ROTATION = 360 / 86164.0905; // deg/s, 항성일 기준
const NODAL_PRECESSION = -5.0 / 86400; // deg/s
const NODE_DRIFT = NODAL_PRECESSION - EARTH_ROTATION; // 지구 고정 좌표계에서의 승교점 경도 변화율

const SIN_I = Math.sin(INCLINATION * DEG);
const COS_I = Math.cos(INCLINATION * DEG);

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** 실측 좌표를 궤도 기준점(anchor)으로 변환 */
export function makeAnchor({ ts, lat, lon }, ascending) {
  let u = Math.asin(clamp(Math.sin(lat * DEG) / SIN_I, -1, 1)) / DEG; // 승교점 기준 궤도 위상
  if (!ascending) u = 180 - u;
  const lonFromNode = Math.atan2(COS_I * Math.sin(u * DEG), Math.cos(u * DEG)) / DEG;
  return { ts, u0: u, node0: lon - lonFromNode };
}

/** 기준점에서 ts(ms) 시각의 위치 계산 */
export function propagate(anchor, ts) {
  const dt = (ts - anchor.ts) / 1000;
  const u = (anchor.u0 + MEAN_MOTION * dt) * DEG;
  const node = anchor.node0 + NODE_DRIFT * dt;
  const lat = Math.asin(SIN_I * Math.sin(u)) / DEG;
  const lon = node + Math.atan2(COS_I * Math.sin(u), Math.cos(u)) / DEG;
  return [lat, normLon(lon)];
}

const toVec = ([lat, lon]) => [
  Math.cos(lat * DEG) * Math.cos(lon * DEG),
  Math.cos(lat * DEG) * Math.sin(lon * DEG),
  Math.sin(lat * DEG),
];
const fromVec = ([x, y, z]) => {
  const r = Math.hypot(x, y, z) || 1;
  return [Math.asin(z / r) / DEG, Math.atan2(y, x) / DEG];
};

/**
 * 단절 구간 보간: 구간 앞쪽 기준점에서 앞으로, 뒤쪽 기준점에서 뒤로 각각 궤도를 전파하고
 * 시간 비율에 따라 구면 위에서 가중 평균한다. 양 끝이 실측 좌표와 정확히 이어진다.
 */
function interpolateGap(a, b, stepMs) {
  const coords = [];
  for (let t = a.ts + stepMs; t < b.ts; t += stepMs) {
    const w = (t - a.ts) / (b.ts - a.ts);
    const va = toVec(propagate(a, t));
    const vb = toVec(propagate(b, t));
    coords.push(fromVec(va.map((v, i) => v * (1 - w) + vb[i] * w)));
  }
  return coords;
}

/** idx 지점에서 위도가 증가 중(상승)인지 이웃 실측값으로 판단. 판단 불가면 null */
function directionAt(points, idx, maxNeighborMs = 5 * 60 * 1000) {
  const p = points[idx];
  const candidates = [points[idx - 1], points[idx + 1]]
    .filter((q) => q && q.ts !== p.ts && Math.abs(q.ts - p.ts) <= maxNeighborMs)
    .sort((x, y) => Math.abs(x.ts - p.ts) - Math.abs(y.ts - p.ts));
  const ref = candidates[0];
  if (!ref) return null;
  const dLat = ref.ts > p.ts ? ref.lat - p.lat : p.lat - ref.lat;
  return dLat >= 0;
}

const angularDist = (a, b) => {
  const [x1, y1, z1] = toVec(a);
  const [x2, y2, z2] = toVec(b);
  return Math.acos(clamp(x1 * x2 + y1 * y2 + z1 * z2, -1, 1));
};

/**
 * 단절 구간 양 끝의 기준점 결정.
 * 이웃 실측점이 없어 상승/하강 방향을 모르면 두 경우를 모두 시도해,
 * 앞쪽 기준점에서 전파한 위치가 뒤쪽 실측점과 가장 가까운 조합을 고른다.
 */
function gapAnchors(prev, cur, dirPrev, dirCur) {
  const options = (d) => (d == null ? [true, false] : [d]);
  let best = null;
  for (const dp of options(dirPrev)) {
    for (const dc of options(dirCur)) {
      const a = makeAnchor(prev, dp);
      const b = makeAnchor(cur, dc);
      const err = angularDist(propagate(a, cur.ts), [cur.lat, cur.lon]) + angularDist(propagate(b, prev.ts), [prev.lat, prev.lon]);
      if (!best || err < best.err) best = { a, b, err };
    }
  }
  return best;
}

/**
 * 지도에 그릴 궤적 세그먼트 생성
 * @returns {{ type: 'actual' | 'inferred', coords: [number, number][] }[]}
 */
export function buildTrack(points, now, { gapMs, stepMs = 30_000 }) {
  const start = now - TRACK_WINDOW_MS;
  const pts = points.filter((p) => p.ts >= start).sort((a, b) => a.ts - b.ts);
  const segments = [];
  if (pts.length === 0) return segments;

  const asc = (i) => directionAt(pts, i) ?? true;
  const xy = (p) => [p.lat, p.lon];

  // 1) 4시간 창의 시작 ~ 첫 실측 좌표: 첫 좌표에서 역방향으로 유추
  const first = pts[0];
  if (first.ts - start > stepMs) {
    const anchor = makeAnchor(first, asc(0));
    const coords = [];
    for (let t = start; t < first.ts; t += stepMs) coords.push(propagate(anchor, t));
    coords.push(xy(first));
    segments.push({ type: 'inferred', coords });
  }

  // 2) 실측 구간과 단절 구간
  let run = [xy(first)];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (cur.ts - prev.ts > gapMs) {
      if (run.length > 1) segments.push({ type: 'actual', coords: run });
      const { a, b } = gapAnchors(prev, cur, directionAt(pts, i - 1), directionAt(pts, i));
      const gap = interpolateGap(a, b, stepMs);
      segments.push({ type: 'inferred', coords: [xy(prev), ...gap, xy(cur)] });
      run = [xy(cur)];
    } else {
      run.push(xy(cur));
    }
  }
  if (run.length > 1) segments.push({ type: 'actual', coords: run });

  return segments;
}

/** 경도 ±180°를 넘는 선이 지도를 가로지르지 않도록 경계에서 분할 */
export function splitAtAntimeridian(coords) {
  const parts = [];
  let cur = [];
  coords.forEach(([lat, lon], i) => {
    if (i > 0) {
      const [plat, plon] = coords[i - 1];
      const d = lon - plon;
      if (Math.abs(d) > 180) {
        const unwrapped = d > 0 ? lon - 360 : lon + 360;
        const edge = d > 0 ? -180 : 180;
        const f = (edge - plon) / (unwrapped - plon);
        const latX = plat + f * (lat - plat);
        cur.push([latX, edge]);
        parts.push(cur);
        cur = [[latX, -edge]];
      }
    }
    cur.push([lat, lon]);
  });
  if (cur.length) parts.push(cur);
  return parts.filter((p) => p.length >= 2);
}

/** 두 좌표 사이 대원 거리(km), radius 기본값은 ISS 고도 기준 */
export function haversineKm(a, b, radius = EARTH_RADIUS_KM + ISS_ALTITUDE_KM) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 최근 실측 좌표(끊김 없는 구간, 최대 2분)로 이동 속도(km/h) 계산.
 * API timestamp 가 초 단위라 인접 2점만 쓰면 오차가 커서 여러 점의 누적 거리를 사용한다.
 */
export function computeSpeedKmh(points, { gapMs, windowMs = 120_000 }) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  let distance = 0;
  let firstTs = last.ts;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    if (b.ts - a.ts > gapMs || last.ts - a.ts > windowMs) break;
    distance += haversineKm(a, b);
    firstTs = a.ts;
  }
  const spanH = (last.ts - firstTs) / 3_600_000;
  if (spanH * 3600 < 4) return null;
  return distance / spanH;
}
