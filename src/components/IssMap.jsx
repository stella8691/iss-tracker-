import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { splitAtAntimeridian } from '../lib/orbit';
import { issIcon } from './issIcon';

// course.html 의 --accent / --accent2
const TRACK_COLOR = '#4f46e5';
const INFERRED_COLOR = '#06b6d4';

export default function IssMap({ segments, current, follow }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const trackLayerRef = useRef(null);
  const markerRef = useRef(null);

  // 지도 생성 (StrictMode 에서 두 번 실행돼도 정리 후 다시 생성)
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 1,
      maxZoom: 7,
      worldCopyJump: true,
      zoomControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    trackLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      trackLayerRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // 궤적: 실측은 실선, 계산/유추는 점선
  useEffect(() => {
    const layer = trackLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    segments.forEach(({ type, coords }) => {
      const style =
        type === 'actual'
          ? { color: TRACK_COLOR, weight: 3, opacity: 0.95 }
          : { color: INFERRED_COLOR, weight: 3, opacity: 0.9, dashArray: '6 8' };
      splitAtAntimeridian(coords).forEach((part) => L.polyline(part, style).addTo(layer));
    });
  }, [segments]);

  // ISS 현재 위치 아이콘
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !current) return;
    const latlng = [current.lat, current.lon];
    if (!markerRef.current) {
      markerRef.current = L.marker(latlng, { icon: issIcon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      markerRef.current.setLatLng(latlng);
    }
    if (follow) map.panTo(latlng, { animate: true, duration: 0.8 });
  }, [current, follow]);

  return <div ref={containerRef} className="map" role="region" aria-label="ISS 위치 지도" />;
}
