export const ISS_API_URL =
  import.meta.env.VITE_ISS_API_URL ?? 'http://api.open-notify.org/iss-now.json';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * ISS 현재 위치를 요청하고, 요청~응답 완료까지 걸린 시간(ms)을 함께 반환한다.
 * 실패한 경우에도 응답 시간을 error.responseTime 에 담아 Polling 간격 계산에 쓰도록 한다.
 */
export async function fetchIssNow(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout;
  const started = performance.now();

  try {
    const res = await fetch(ISS_API_URL, { signal: combined, cache: 'no-store' });
    if (!res.ok) throw new Error(`API가 ${res.status} 상태로 응답했습니다.`);
    const json = await res.json();
    const responseTime = performance.now() - started;

    if (json.message !== 'success' || !json.iss_position) {
      throw new Error('API 응답에 위치 정보가 없습니다.');
    }

    return {
      position: {
        ts: json.timestamp * 1000,
        lat: Number(json.iss_position.latitude),
        lon: Number(json.iss_position.longitude),
      },
      responseTime,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === 'TimeoutError') error.message = `${REQUEST_TIMEOUT_MS / 1000}초 안에 응답이 없습니다.`;
    if (error.name === 'TypeError') {
      error.message =
        'API에 연결할 수 없습니다. 네트워크, CORS, 또는 https 페이지에서의 http 요청 차단 여부를 확인하세요.';
    }
    error.responseTime = performance.now() - started;
    throw error;
  }
}
