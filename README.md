# 밤하늘 연출실 (night-sky-studio)

음악을 고르고 시간표 위에 불꽃을 놓아 나만의 불꽃축제를 연출하는 웹 시뮬레이터입니다.
기획서는 [docs/plan.html](docs/plan.html)에 있습니다.

## 실행

```bash
npm install
npm run dev
```

| 명령 | 하는 일 |
|:--|:--|
| `npm run dev` | 개발 서버 (같은 Wi-Fi의 휴대폰에서도 열 수 있음) |
| `npm test` | 엔진 테스트 (재현성, 상승 시간 계산) |
| `npm run typecheck` | 타입 검사 |
| `npm run build:pages` | GitHub Pages용 정적판 빌드 → `apps/web/dist` |

## 구조

```
packages/engine   불꽃 계산, 카메라, 배경, WebGL2 렌더러, 쇼 파일 규격 (화면 코드 없음)
apps/web          화면 (지금은 0단계 렌더 시험)
docs/plan.html    기획서
```

- 좌표는 무대 원점 기준 미터 `[동, 높이, 북]`입니다. 2D 화면도 3D 세계를 고정된 카메라로 본 것입니다.
- 계산은 1/120초 고정 간격으로만 합니다. 같은 쇼는 화면 주사율이나 기기와 상관없이 같게 재생됩니다.
- cue의 `t`는 터지는 시각입니다. 발사 시각은 카탈로그의 상승 시간을 빼서 엔진이 계산합니다.
