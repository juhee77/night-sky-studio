// 손으로 만드는 동작의 채점: 화면에서 받은 손가락 길을 솜씨 값(0~1)으로 바꾼다.
//   별 굴리기: 굴림판 위에서 원을 그린다. 바퀴 수와, 원의 크기가 얼마나 일정한지.
//   종이 바르기: 반구 칸을 문지른다. 칸마다 문지른 횟수가 고를수록, 다 덮은 횟수만큼 겹.
//   할약 붓기: 길게 눌러 붓는다. 멈춘 양이 할약 양, 가운데서 벗어난 자리가 치우침.

/** 별 굴리기에 필요한 바퀴 수 */
export const ROLL_TURNS = 6;

export interface RollResult {
  turns: number;
  /** 원 크기가 일정한 정도 (0~1) */
  evenness: number;
  done: boolean;
}

/** 굴림판 가운데(cx, cy) 둘레로 그린 점들 */
export function rollScore(pts: [number, number][], cx: number, cy: number): RollResult {
  if (pts.length < 3) return { turns: 0, evenness: 0, done: false };
  let total = 0;
  let prev = Math.atan2(pts[0][1] - cy, pts[0][0] - cx);
  const rs: number[] = [];
  for (const [x, y] of pts) {
    const a = Math.atan2(y - cy, x - cx);
    let d = a - prev;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = a;
    rs.push(Math.hypot(x - cx, y - cy));
  }
  const turns = Math.abs(total) / (Math.PI * 2);
  const m = rs.reduce((s, r) => s + r, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r - m) ** 2, 0) / rs.length);
  // 가운데에 너무 가까우면 굴린 것이 아니다.
  const evenness = m < 8 ? 0 : Math.max(0, Math.min(1, 1 - (sd / m) * 2.5));
  return { turns, evenness, done: turns >= ROLL_TURNS };
}

export interface PasteResult {
  /** 다 덮은 횟수 = 종이 겹 수 */
  layers: number;
  /** 문지른 고르기 (0~1) */
  evenness: number;
  /** 지금 겹을 덮은 비율 */
  coverage: number;
}

/** 칸마다 문지른 횟수. 한 칸을 한 번 넘게 문지르면 그 겹은 덮인 것으로 본다. */
export function pasteScore(hits: number[]): PasteResult {
  if (!hits.length) return { layers: 0, evenness: 0, coverage: 0 };
  const min = Math.min(...hits);
  const m = hits.reduce((s, h) => s + h, 0) / hits.length;
  const sd = Math.sqrt(hits.reduce((s, h) => s + (h - m) ** 2, 0) / hits.length);
  const covered = hits.filter((h) => h > min).length / hits.length;
  return { layers: min, evenness: m ? Math.max(0, Math.min(1, 1 - (sd / m) * 1.2)) : 0, coverage: covered };
}

/** 할약 붓기: 부은 시간(초)과 가운데서 벗어난 정도(-1~1) → 할약 양과 치우침 */
export function pourResult(seconds: number, offset: number): { breakCharge: number; chargeOffset: number } {
  return {
    // 3초면 가득 (100%), 알맞은 양은 1.5초
    breakCharge: Math.round(Math.max(0, Math.min(1, seconds / 3)) * 100) / 100,
    chargeOffset: Math.round(Math.max(0, Math.min(1, Math.abs(offset) * 1.4)) * 100) / 100,
  };
}
