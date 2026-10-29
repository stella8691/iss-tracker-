import L from 'leaflet';

// 트러스, 태양전지판 8장, 중앙 모듈로 구성한 ISS 아이콘
const svg = `
<svg viewBox="0 0 64 64" width="52" height="52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="#1e293b" stroke-width="1.2" stroke-linejoin="round">
    <rect x="4" y="30.5" width="56" height="3" rx="1" fill="#c9d1dc"/>
    ${[6, 15, 41, 50]
      .map(
        (x) => `
      <rect x="${x}" y="10" width="8" height="18" fill="#4f46e5"/>
      <rect x="${x}" y="36" width="8" height="18" fill="#4f46e5"/>
      <path d="M${x + 4} 10v18M${x + 4} 36v18M${x} 16h8M${x} 22h8M${x} 42h8M${x} 48h8" stroke="#a5b4fc" stroke-width=".6"/>
      <path d="M${x + 4} 28v2.5M${x + 4} 33.5V36"/>`,
      )
      .join('')}
    <rect x="25" y="24" width="14" height="16" rx="2.5" fill="#f2f4f7"/>
    <rect x="29" y="18" width="6" height="28" rx="2" fill="#e8ebf0"/>
    <rect x="22" y="29" width="20" height="6" rx="2" fill="#dfe3ea"/>
    <circle cx="32" cy="32" r="2.2" fill="#06b6d4"/>
  </g>
</svg>`;

export const issIcon = L.divIcon({
  className: 'iss-marker',
  html: `<span class="iss-marker__pulse"></span>${svg}`,
  iconSize: [52, 52],
  iconAnchor: [26, 26],
});
