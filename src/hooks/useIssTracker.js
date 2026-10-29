import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIssNow } from '../api/issApi';
import { deleteOlderThan, loadPositionsSince, savePosition } from '../db/positionStore';
import { TRACK_WINDOW_MS, buildTrack, computeSpeedKmh } from '../lib/orbit';

export const MIN_INTERVAL_MS = 5_000;
export const MAX_INTERVAL_MS = 60_000;
const RT_SMOOTHING = 0.3; // 응답속도 지수이동평균(EMA) 가중치
const RT_FACTOR = 5; // 평균 응답속도 1초당 Polling 간격을 5초 늘림

/**
 * 응답속도 기반 Polling 간격 계산
 *  - 기본 5초 + 평균 응답속도 × 5  (응답이 느릴수록 서버 부담을 줄이도록 간격을 넓힘)
 *  - 연속 실패 시 2배씩 늘림 (최대 60초)
 *  - 어떤 경우에도 5초 미만으로 내려가지 않음
 */
export function computeInterval(avgResponseTime, consecutiveErrors) {
  let interval = MIN_INTERVAL_MS + avgResponseTime * RT_FACTOR;
  if (consecutiveErrors > 0) interval *= 2 ** consecutiveErrors;
  return Math.round(Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, interval)) / 100) * 100;
}

const trackKey = ['iss-track'];

export function useIssTracker() {
  const queryClient = useQueryClient();

  // refetchInterval 함수가 fetch 직후에 바로 최신 값을 읽을 수 있도록 ref 로 관리
  const pollRef = useRef({ interval: MIN_INTERVAL_MS, avg: null, errors: 0 });
  const [polling, setPolling] = useState({
    interval: MIN_INTERVAL_MS,
    lastResponseTime: null,
    avgResponseTime: null,
    errors: 0,
  });

  const recordResponse = useCallback((responseTime, failed) => {
    const prev = pollRef.current;
    const avg = prev.avg == null ? responseTime : prev.avg * (1 - RT_SMOOTHING) + responseTime * RT_SMOOTHING;
    const errors = failed ? prev.errors + 1 : 0;
    const interval = computeInterval(avg, errors);
    pollRef.current = { interval, avg, errors };
    setPolling({ interval, lastResponseTime: responseTime, avgResponseTime: avg, errors });
  }, []);

  const issQuery = useQuery({
    queryKey: ['iss-now'],
    queryFn: async ({ signal }) => {
      try {
        const result = await fetchIssNow(signal);
        recordResponse(result.responseTime, false);
        return result;
      } catch (err) {
        if (err.name !== 'AbortError') recordResponse(err.responseTime ?? 0, true);
        throw err;
      }
    },
    // fetch 가 끝날 때마다 TanStack Query 가 이 함수를 다시 호출해 다음 간격을 정한다.
    refetchInterval: () => pollRef.current.interval,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
    staleTime: MIN_INTERVAL_MS,
  });

  const trackQuery = useQuery({
    queryKey: trackKey,
    queryFn: () => loadPositionsSince(Date.now() - TRACK_WINDOW_MS),
    staleTime: Infinity,
  });

  const { mutate: persist } = useMutation({
    mutationFn: (position) => savePosition(position, Date.now() - TRACK_WINDOW_MS),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trackKey }),
  });

  // 새 좌표가 도착하면 IndexedDB 에 저장
  const position = issQuery.data?.position;
  useEffect(() => {
    if (position) persist(position);
  }, [position, persist]);

  // 1분마다 4시간이 지난 좌표를 삭제하고, 궤적의 시간 창을 앞으로 이동
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(async () => {
      await deleteOlderThan(Date.now() - TRACK_WINDOW_MS);
      queryClient.invalidateQueries({ queryKey: trackKey });
      setNow(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, [queryClient]);

  const points = useMemo(() => trackQuery.data ?? [], [trackQuery.data]);
  const gapMs = Math.max(60_000, polling.interval * 2.5);
  const trackNow = Math.max(now, points.at(-1)?.ts ?? 0);

  const segments = useMemo(() => buildTrack(points, trackNow, { gapMs }), [points, trackNow, gapMs]);
  const speedKmh = useMemo(() => computeSpeedKmh(points, { gapMs }), [points, gapMs]);

  return {
    current: position ?? points.at(-1) ?? null,
    segments,
    speedKmh,
    polling,
    storedCount: points.length,
    lastFetchedAt: issQuery.dataUpdatedAt || null,
    error: issQuery.error,
    isFetching: issQuery.isFetching,
    nextFetchAt: (Math.max(issQuery.dataUpdatedAt, issQuery.errorUpdatedAt) || Date.now()) + polling.interval,
  };
}
