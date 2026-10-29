import { useEffect, useState } from 'react';

const fmt = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? '–' : n.toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, (target - now) / 1000);
}

export default function StatsPanel({ speedKmh, polling, nextFetchAt, isFetching }) {
  const remaining = useCountdown(nextFetchAt);
  const failing = polling.errors > 0;

  return (
    <div className="status-grid" aria-label="ISS 이동 속도와 API 상태">
      <div className="status s3">
        <span className="label">🚀 이동 속도</span>
        <span className="value">
          {fmt(speedKmh)}
          <span className="unit">km/h</span>
        </span>
        <span className="note">초속 {fmt(speedKmh != null ? speedKmh / 3600 : null, 2)} km · 지표 기준</span>
      </div>

      <div className={`status ${failing ? 's5' : 's2'}`}>
        <span className="label">⏱️ Polling 간격</span>
        <span className="value">
          {fmt(polling.interval / 1000, 1)}
          <span className="unit">초</span>
        </span>
        <span className="note" aria-live="polite">
          {isFetching ? '요청 중…' : `다음 요청까지 ${fmt(remaining, 0)}초`}
          {failing && ` · 연속 실패 ${polling.errors}회`}
        </span>
      </div>

      <div className="status s4">
        <span className="label">📡 API 응답속도</span>
        <span className="value">
          {fmt(polling.lastResponseTime)}
          <span className="unit">ms</span>
        </span>
        <span className="note">평균 {fmt(polling.avgResponseTime)} ms (최근 응답에 가중치)</span>
      </div>
    </div>
  );
}
