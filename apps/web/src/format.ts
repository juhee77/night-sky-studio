/** 1:05.30 같은 시각 표시. 음수면 앞에 −를 붙인다. */
export function fmtTime(sec: number): string {
  const sign = sec < 0 ? '−' : '';
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  return `${sign}${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
