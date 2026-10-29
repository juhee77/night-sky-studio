// 의뢰 조건 → 자동 연출 옵션. 자동 연출이 맞출 수 있는 조건은 옵션으로 넘기고,
// 사람이 직접 해야 하는 조건(틀 그림, 서랍에 없는 내 불꽃, 실전 장비)은 할 일과 함께 따로 돌려준다.

import { ART_PRESETS } from './art.ts';
import type { AutoOptions } from './auto.ts';
import { typeLabel, type FireworkType, type Size } from './catalog.ts';
import type { Commission, Rule } from './commission.ts';
import type { CustomShell } from './custom.ts';
import { isLive } from './live.ts';
import { shellMeetsRule } from './score.ts';
import type { Show } from './show.ts';

export interface CommissionAuto {
  options: Partial<AutoOptions>;
  /** 자동 연출로는 못 맞추는 조건과 할 일 */
  manual: { rule: Rule; hint: string }[];
}

const sizeOf = (s: CustomShell): Size => s.build?.size ?? 5;

/** 받침이 있으면 「을」, 없으면 「를」 */
function eulReul(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
}

/**
 * unlocked: 해금한 불꽃 (이번 주 도전은 모두 쓴다)
 * shells: 이 쇼에 쓸 수 있는 내 불꽃 (의뢰면 개발한 것만)
 */
export function commissionAutoOptions(c: Commission, show: Show, unlocked: FireworkType[], shells: CustomShell[]): CommissionAuto {
  const o: Partial<AutoOptions> = { budget: c.budget, liked: c.taste.colors, wind: c.wind };
  if (!c.challenge) o.allowed = unlocked;
  const manual: CommissionAuto['manual'] = [];
  const mine = (kind: 'kamuroFinish' | 'workshopShell' | 'outerPop') => shells.find((s) => shellMeetsRule(kind, s));
  const notInDrawer = (what: string) =>
    `공작소에서 ${what}을 만들어 서랍에 넣${c.challenge ? '으면' : '고 의뢰소에서 개발하면'} 자동 연출이 씁니다.`;
  for (const r of c.rules) {
    switch (r.kind) {
      case 'maxSize':
        o.maxSize = r.size;
        break;
      case 'colorsOnly':
        o.colors = r.colors;
        break;
      case 'include':
        (o.include ??= []).push(r.type);
        if (o.allowed && !o.allowed.includes(r.type)) manual.push({ rule: r, hint: `「의뢰소」에서 ${typeLabel(r.type)}${eulReul(typeLabel(r.type))} 해금하면 자동 연출이 넣습니다.` });
        else if (r.type === 'niagara' && !show.launchers.some((l) => l.kind === 'bridge')) manual.push({ rule: r, hint: '나이아가라를 걸 다리가 있는 무대를 고르세요.' });
        break;
      case 'endColors':
        o.endColors = { seconds: r.seconds, colors: r.colors };
        break;
      case 'finale':
        o.finaleSeconds = Math.max(o.finaleSeconds ?? 0, r.seconds);
        break;
      case 'frameText':
        o.text = c.client.slice(0, 12);
        if (o.allowed && !o.allowed.includes('lancework')) manual.push({ rule: r, hint: '「의뢰소」에서 지상 틀불꽃을 해금하면 자동 연출이 글자를 띄웁니다.' });
        else if (!show.launchers.some((l) => l.kind === 'frame')) manual.push({ rule: r, hint: '「발사장」에서 지상 틀을 세우세요.' });
        break;
      case 'kamuroFinish': {
        const s = mine('kamuroFinish');
        if (s) o.closeCustom = { id: s.id, size: sizeOf(s) };
        else manual.push({ rule: r, hint: notInDrawer('긴 버들(카무로) 불꽃') });
        break;
      }
      case 'workshopShell':
      case 'outerPop': {
        const s = mine(r.kind);
        if (s) (o.mustCustoms ??= []).push({ id: s.id, size: sizeOf(s) });
        else manual.push({ rule: r, hint: notInDrawer(r.kind === 'outerPop' ? '바깥 층이 차례로 터지는 불꽃' : '제작 공방 불꽃') });
        break;
      }
      case 'frameArt':
        // 본보기 그림(하트·별·웃는 얼굴) 가운데 주제에 맞는 것을 세운다. 내 그림으로 바꾸려면 「그림 그리기」로.
        o.art = ART_PRESETS[artFor(r.subject)]();
        if (o.allowed && !o.allowed.includes('lancework')) manual.push({ rule: r, hint: '「의뢰소」에서 지상 틀불꽃을 해금하면 자동 연출이 그림을 세웁니다.' });
        else if (!show.launchers.some((l) => l.kind === 'frame')) manual.push({ rule: r, hint: '「발사장」에서 지상 틀을 세우세요.' });
        break;
      case 'live':
        if (!isLive(show)) manual.push({ rule: r, hint: '「발사장」에서 실전 모드를 켜고 허가 구역·장비를 맞추세요.' });
        break;
    }
  }
  return { options: o, manual };
}

/** 그림 주제에 맞는 본보기 그림 (모르면 별: 로고에 흔한 모양) */
export function artFor(subject: string): keyof typeof ART_PRESETS {
  if (/하트|사랑|웨딩|결혼|커플/.test(subject)) return '하트';
  if (/웃|얼굴|어린이|아이/.test(subject)) return '웃는 얼굴';
  return '별';
}
