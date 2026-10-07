const s = (body, vb = 24) => `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icon = {
  arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowUR: s('<path d="M7 17 17 7M8 7h9v9"/>'),
  arrowDown: s('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  prev: s('<path d="M15 6l-6 6 6 6"/>'),
  next: s('<path d="M9 6l6 6-6 6"/>'),
  bed: s('<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'),
  bath: s('<path d="M4 12h16v2a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-2ZM7 12V6.5A2.5 2.5 0 0 1 9.5 4 2.5 2.5 0 0 1 12 6.5M6 18l-1 2M18 18l1 2"/>'),
  area: s('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  pin: s('<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
  check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  sun: s('<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.5 1.5M16.9 16.9l1.5 1.5M5.6 18.4l1.5-1.5M16.9 7.1l1.5-1.5"/>'),
  dusk: s('<path d="M4 17h16M7 17a5 5 0 0 1 10 0M12 5v3M5.2 9.2l1.6 1.6M18.8 9.2l-1.6 1.6"/>'),
  moon: s('<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5Z"/>'),
  mark: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true"><circle cx="16" cy="16" r="14.4"/><path d="M5 19.5c4-6.2 8.4-8.6 13-8.6 3.6 0 6.6 1.4 9 3.6"/><path d="M5 23.5c4-4.4 8-6.2 12-6.2 3.8 0 7 1.5 10 4.6"/></svg>`,
};
