// مجموعة أيقونات SVG (بديل الإيموجي) — تأخذ لونها من currentColor وحجمها من font-size.
const s = (p, fill = false) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

export const ICONS = {
  bell:    s('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  mic:     s('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>'),
  person:  s('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
  tv:      s('<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>'),
  bolt:    s('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', true),
  target:  s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  users:   s('<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path d="M16 4.6a3 3 0 0 1 0 5.8"/><path d="M21 20v-1a5 5 0 0 0-3-4.6"/>'),
  hash:    s('<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>'),
  trophy:  s('<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a2 2 0 0 0 0 4h1M17 6h3a2 2 0 0 1 0 4h-1"/><path d="M9 16v3h6v-3M8 21h8"/>'),
  play:    s('<path d="M7 4v16l13-8z"/>', true),
  flag:    s('<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>'),
  refresh: s('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5"/>'),
  copy:    s('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  plus:    s('<path d="M12 5v14M5 12h14"/>'),
  rocket:  s('<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 13c5-9 11-9 11-9s0 6-9 11l-2-2z"/><circle cx="14.5" cy="9.5" r="1.4"/>'),
  check:   s('<path d="M5 13l4 4L19 7"/>'),
};

// أيقونة بحجم/لون محدّد (للسياقات الكبيرة).
export function icon(name) { return ICONS[name] || ''; }
