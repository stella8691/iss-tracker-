import { useState } from 'react';
import IssMap from './components/IssMap';
import StatsPanel from './components/StatsPanel';
import { useIssTracker } from './hooks/useIssTracker';

const formatCoord = (value, pos, neg) =>
  value == null ? '–' : `${Math.abs(value).toFixed(2)}° ${value >= 0 ? pos : neg}`;

export default function App() {
  const [follow, setFollow] = useState(true);
  const { current, segments, speedKmh, polling, storedCount, lastFetchedAt, error, isFetching, nextFetchAt } =
    useIssTracker();

  return (
    <>
      <div className="topbar">
        <a className="brand" href="#map">◂ ISS 실시간 추적</a>
        <nav>
          <a href="#map">궤적 지도</a>
          <a href="#stats">속도·Polling</a>
          <a href="#how">동작 방식</a>
        </nav>
      </div>

      <header className="hero">
        <span className="badge">
          <span className={`live-dot${error ? ' live-dot--off' : ''}`} aria-hidden="true" />
          {error ? '연결 재시도 중' : '실시간'} · open-notify API · 최근 4시간 궤적
        </span>
        <h1>국제우주정거장은 지금 어디에?</h1>
        <p className="coords" aria-live="polite">
          {current
            ? `${formatCoord(current.lat, 'N', 'S')} / ${formatCoord(current.lon, 'E', 'W')}`
            : '첫 위치를 받아오는 중입니다'}
        </p>
        <p>
          {lastFetchedAt
            ? `마지막 수신 ${new Date(lastFetchedAt).toLocaleTimeString('ko-KR')}`
            : 'API 응답을 기다리고 있습니다'}
        </p>
      </header>

      <main>
        <section id="map">
          <div className="section-head">
            <span className="chip">실시간</span>
            <h2>우주정거장 궤적 지도</h2>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>🛰️ 최근 4시간 이동 경로</h3>
              <label className="follow">
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
                지도가 ISS를 따라가기
              </label>
            </div>

            {error && (
              <p className="alert" role="alert">
                위치를 받아오지 못했습니다. {error.message} 다음 요청은 자동으로 다시 시도합니다.
              </p>
            )}

            <IssMap segments={segments} current={current} follow={follow} />

            <div className="legend">
              <span className="legend__item">
                <span className="legend__line" /> 실측 궤적
              </span>
              <span className="legend__item">
                <span className="legend__line legend__line--dashed" /> 계산·유추 궤적
              </span>
              <span className="legend__meta">IndexedDB 저장 좌표 {storedCount.toLocaleString('ko-KR')}개</span>
            </div>
          </div>
        </section>

        <section id="stats">
          <div className="section-head">
            <span className="chip">모니터링</span>
            <h2>이동 속도와 API 상태</h2>
          </div>
          <div className="card">
            <StatsPanel speedKmh={speedKmh} polling={polling} nextFetchAt={nextFetchAt} isFetching={isFetching} />
          </div>
        </section>

        <section id="how">
          <div className="section-head">
            <span className="chip">원리</span>
            <h2>동작 방식</h2>
          </div>
          <div className="card">
            <ol className="steps">
              <li>
                <code>iss-now.json</code>을 요청할 때마다 응답속도를 재고, 평균 응답속도로 다음 Polling 간격을
                정합니다. 간격은 <code>5초 + 평균 응답속도 × 5</code>이며 5초보다 짧아지지 않습니다.
              </li>
              <li>받은 좌표는 브라우저 IndexedDB에 저장하고, 4시간이 지난 좌표는 자동으로 삭제합니다.</li>
              <li>수집이 끊긴 구간은 앞뒤 실측 좌표를 잇는 궤도를 계산해 점선으로 그립니다.</li>
              <li>4시간 이내 수집 기록이 부족하면 가장 오래된 실측 위치에서 4시간 전까지 거슬러 계산합니다.</li>
            </ol>
          </div>
        </section>
      </main>

      <footer>
        데이터 출처 <a href="http://open-notify.org/">Open Notify</a> · 지도 © OpenStreetMap contributors
      </footer>
    </>
  );
}
