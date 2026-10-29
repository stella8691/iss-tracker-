# ISS 실시간 위치 추적

React 19 + TanStack Query로 만든 프론트엔드 전용 앱입니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
```

## 구조

```
src/
├─ api/issApi.js              API 요청 + 응답속도 측정
├─ db/positionStore.js        IndexedDB 저장 / 조회 / 4시간 지난 좌표 삭제
├─ lib/orbit.js               궤도 모델, 단절 구간 보간, 4시간 역추정, 속도 계산
├─ hooks/useIssTracker.js     Polling(useQuery), 저장(useMutation), 궤적 조합
├─ components/IssMap.jsx      Leaflet 지도, 실측 실선 / 유추 점선, ISS 아이콘
├─ components/StatsPanel.jsx  이동 속도, Polling 간격, API 응답속도
└─ styles.css                 화면 스타일 (상단 :root 변수만 바꾸면 테마 교체)
```

## 동작 방식

- **Polling 간격**: `5초 + 평균 응답속도(EMA) × 5`, 연속 실패 시 2배씩 늘림(최대 60초), 최소 5초 보장.
  fetch가 끝날 때마다 TanStack Query가 `refetchInterval` 함수를 다시 호출해 새 간격이 바로 적용됩니다.
- **궤적 유추**: 경사각 51.64°, 주기 약 92.6분의 원궤도 근사 모델.
  - 단절 구간: 앞·뒤 실측점에서 각각 궤도를 전파해 시간 비율로 섞어 양 끝을 실측점과 이어 붙임
  - 4시간 이내 데이터가 부족할 때: 가장 오래된 실측점에서 4시간 전까지 역방향 계산
  - TLE 기반 정밀 계산이 아니므로 수 시간 역추정 시 수백 km 정도 오차가 날 수 있습니다.
- **데이터 보존**: 저장 시, 앱 시작 시, 1분마다 4시간이 지난 좌표를 삭제합니다.

## API 연결 방식

`api.open-notify.org`는 http만 지원합니다. 브라우저의 CORS·Mixed Content 차단을 피하려고
앱은 기본으로 같은 출처의 프록시(`/iss-api/iss-now.json`)를 거쳐 요청합니다.
- 로컬: Vite 개발/미리보기 서버 프록시 (`vite.config.js`)
- Vercel: `vercel.json`의 rewrites

그 밖의 정적 호스팅처럼 프록시가 없는 곳에 배포할 때는 `.env`에 아래처럼 직접 주소를 지정하세요.

```
VITE_ISS_API_URL=http://api.open-notify.org/iss-now.json
```
