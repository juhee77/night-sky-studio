# 밤하늘 연출실 (night-sky-studio)

음악을 고르고 시간표 위에 불꽃을 놓아 나만의 불꽃축제를 연출하는 웹 시뮬레이터입니다.
설치 없이 브라우저에서 바로 열 수 있고, 만든 쇼는 링크 하나로 보낼 수 있습니다.

**▶ 바로 해 보기: https://juhee77.github.io/night-sky-studio/**

| 문서 | |
|:--|:--|
| [화면 설계](https://juhee77.github.io/night-sky-studio/docs/wireframes.html) | 화면별 와이어프레임과 실제 화면 ([docs/wireframes.html](docs/wireframes.html)) |
| [기획서](https://juhee77.github.io/night-sky-studio/docs/plan.html) | 기능, 단계, 용어 사전 ([docs/plan.html](docs/plan.html)) |
| [서버판](server/README.md) | 짧은 링크, 계정, 클라우드 저장, 상영관 |

![간단 화면: 무대 위로 국화 불꽃이 터지는 모습](docs/screenshots/02-simple.png)

## 할 수 있는 것

- **자동 연출**: 곡의 박자와 세기를 읽어 불꽃을 놓아 줍니다. 기본 곡이나 내 음악 파일을 씁니다.
- **편집**: 시간표에서 불꽃 종류 · 크기 · 색 · 발사 위치(바지선 · 다리 · 지상 틀 · 드론)를 박자에 맞춰 놓습니다.
- **감상과 공유**: 무대만 화면 가득 보고, 링크 · 장노출 사진 · 영상(MP4)으로 보냅니다.
- **공작소**: 내 불꽃을 만듭니다.
  - 빠른 설계: 슬라이더로 바로
  - 제작 공방: 반구에 별을 붙여 알을 조립
  - 작업대: 배합부터 시험장까지 손으로
- **의뢰소**: 손님의 의뢰(곡 · 예산 · 조건)를 받아 납품하고, 돈과 평판으로 불꽃을 해금합니다.
- **발사장**: 평면도에서 바지선 자리와 안전거리를 정하고, 실전 모드에서는 허가 · 장전 · 배선까지 맞춥니다.
  - 무대는 기본 무대 7곳 중에서 고르거나, 지도에서 실제 장소를 골라 만듭니다.
- **단계별로 열기**: 처음에는 꼭 필요한 버튼만 보이고, 위 막대의 「다음: …」이 알려 주는 일을 해낼 때마다 기능이 하나씩 열립니다.

| 휴대폰 간단 화면 | 휴대폰 편집 화면 | 공작소 제작 공방 |
|:--:|:--:|:--:|
| <img src="docs/screenshots/10-mobile-simple.png" width="220" alt="휴대폰 간단 화면"> | <img src="docs/screenshots/11-mobile-edit.png" width="220" alt="휴대폰 편집 화면"> | <img src="docs/screenshots/05-workshop-build.png" width="360" alt="공작소 제작 공방"> |

## 실행

```bash
npm install
npm run dev
```

| 명령 | 하는 일 |
|:--|:--|
| `npm run dev` | 개발 서버 (같은 Wi-Fi의 휴대폰에서도 열 수 있음) |
| `npm test` | 엔진 테스트 |
| `npm run typecheck` | 타입 검사 |
| `npm run e2e` | 화면 자동 테스트 (Playwright, 개발 서버를 띄워 실제 브라우저로 누름) |
| `npm run build:pages` | GitHub Pages용 정적판 빌드 → `apps/web/dist` |

## 배포

- **정적판 (GitHub Pages)**: `main`에 push하면 [pages.yml](.github/workflows/pages.yml)이 타입 검사와 테스트를 거쳐 앱과 `docs/`를 올립니다.
  - 앱: https://juhee77.github.io/night-sky-studio/
  - 공유 링크를 여는 상영관: `…/v/`
  - 문서: `…/docs/`
  - 쇼와 내 불꽃은 그 브라우저에만 저장됩니다.
- **서버판**: 짧은 링크, 계정, 클라우드 저장, 상영관이 필요하면 [server/README.md](server/README.md)를 보세요. 서버가 없어도 정적판은 그대로 동작합니다.
- PR마다 [ci.yml](.github/workflows/ci.yml)이 타입 검사, 엔진 테스트, 화면 자동 테스트, 정적판 빌드를 돌립니다.

## 구조

```
packages/engine   불꽃 계산, 자동 연출, 의뢰·채점, 불꽃 설계, 카메라, WebGL2 렌더러, 쇼 파일 규격 (화면 코드 없음)
apps/web          편집기(index.html)와 상영관(v/index.html)
apps/web/e2e      화면 자동 테스트
server            서버판 (Spring Boot)
docs              기획서, 화면 설계, 스크린샷
```

- 좌표는 무대 원점 기준 미터 `[동, 높이, 북]`입니다. 2D 화면도 3D 세계를 고정된 카메라로 본 것입니다.
- 계산은 1/120초 고정 간격으로만 합니다. 같은 쇼는 화면 주사율이나 기기와 상관없이 같게 재생됩니다.
- cue의 `t`는 터지는 시각입니다. 발사 시각은 카탈로그의 상승 시간을 빼서 엔진이 계산합니다.
- 화약 배합과 제조 공정은 게임용 근사이며 실제 제조 방법이 아닙니다.
