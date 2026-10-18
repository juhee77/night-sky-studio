// 난수는 모두 정수 해시로 만든다. 상태를 들고 다니는 난수기와 달리
// "어느 불꽃의 몇 번째 별, 몇 번째 스텝"만 같으면 언제 어디서 계산해도 같은 값이 나온다.

/** 32비트 정수 세 개를 섞은 해시. */
export function hash32(a: number, b = 0, c = 0): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** [0, 1) 범위의 결정적 난수. */
export function rand01(a: number, b = 0, c = 0): number {
  return hash32(a, b, c) / 4294967296;
}

/** 문자열(발사 위치 id 등)을 정수로. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 배경처럼 한 번에 쭉 뽑아 쓰는 곳에서 쓰는 순차 난수기. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
