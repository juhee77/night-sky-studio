// 경력 이야기: 동네 축제에서 시작해 지방 축제, 강변 대축제를 거쳐 한강 세계불꽃축제 대회까지.
// 단계는 납품해서 모은 별 수로 열린다. 게시판의 의뢰 등급(평판)과 해금은 그대로 두고, 그 위에 이야기를 입힌다.

import { TRACKS, type Commission } from './commission.ts';

export interface StoryStage {
  id: 'village' | 'region' | 'river' | 'contest';
  title: string;
  /** 이 단계가 열리는 별 수 (납품한 의뢰의 별을 모두 더한 것) */
  stars: number;
  /** 단계가 열릴 때 의뢰인이 하는 말 */
  client: string;
  line: string;
}

export const STORY: StoryStage[] = [
  {
    id: 'village', title: '동네 축제', stars: 0, client: '호숫가 마을 이장님',
    line: '우리 마을 호숫가 축제에 불꽃을 처음 올려 보려고요. 크지 않아도 돼요, 마을 사람들이 고개만 들게 해 주세요.',
  },
  {
    id: 'region', title: '지방 축제', stars: 5, client: '시 축제 조직위원회',
    line: '마을 축제 소문 듣고 연락드렸어요. 이번엔 다리가 있는 강변 도시예요. 나이아가라도 걸 수 있고, 관객도 훨씬 많아요.',
  },
  {
    id: 'river', title: '강변 대축제', stars: 12, client: '강변 대축제 사무국',
    line: '강폭이 2km 넘는 강에서 하는 큰 축제예요. 바지선이 길게 늘어서고 큰 알을 마음껏 쏠 수 있어요. 날씨는 더 까다롭고요.',
  },
  {
    id: 'contest', title: '한강 세계불꽃축제', stars: 20, client: '세계불꽃축제 운영위원회',
    line: '올해 한강 세계불꽃축제 대회에 우리 팀으로 나가 주세요. 여러 나라 팀이 같은 밤 여의도에서 겨룹니다.',
  },
];

/** 별 수로 지금 단계 (0부터) */
export function storyStage(stars: number): number {
  let k = 0;
  for (let i = 0; i < STORY.length; i++) if (stars >= STORY[i].stars) k = i;
  return k;
}

/** 대회 의뢰: 한강, 웅장한 곡, 피날레와 나이아가라, 큰 예산 */
export function contestCommission(): Commission {
  return {
    id: 'contest-hangang',
    tier: 2,
    title: '한강 세계불꽃축제 · 나라별 대회',
    client: '세계불꽃축제 운영위원회',
    quote: '원효대교에 나이아가라를 걸고, 마지막 20초는 하늘을 꽉 채워 주세요. 심사는 다른 나라 팀과 같은 기준으로 합니다.',
    music: TRACKS.epic,
    venue: 'hangang',
    budget: 420,
    reward: 600,
    wind: { dir: 270, speed: 2.4 },
    seat: 'front-near',
    taste: { colors: ['gold', 'white', 'red'], style: 'grand' },
    rules: [{ kind: 'finale', seconds: 20 }, { kind: 'include', type: 'niagara' }],
  };
}

/** 대회에 함께 나온 가상의 팀과 점수 */
export const RIVALS: { team: string; total: number }[] = [
  { team: '은하수 불꽃단', total: 89 },
  { team: '북쪽 오로라 공방', total: 84 },
  { team: '바닷바람 연화회', total: 78 },
  { team: '붉은 등대 팀', total: 71 },
];

/** 대회 순위표 (내 팀 포함, 점수 높은 순). 같은 점수면 내 팀이 앞 */
export function contestRanking(total: number): { team: string; total: number; mine: boolean }[] {
  return [{ team: '우리 팀', total, mine: true }, ...RIVALS.map((r) => ({ ...r, mine: false }))].sort((a, b) => b.total - a.total || Number(b.mine) - Number(a.mine));
}
