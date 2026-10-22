# 밤하늘 연출실 서버판

짧은 공유 링크, 계정(이름·암호), 쇼와 내 불꽃 클라우드 저장을 맡는다. 정적판은 이 서버 없이도 그대로 동작한다.

## 로컬에서 띄우기

```bash
./gradlew bootRun
```

개발용 DB는 `server/data/`의 H2 파일이다. 화면은 `VITE_API_URL`을 주고 띄우면 「계정」 메뉴와 「짧은 링크 만들기」가 보인다.

```bash
VITE_API_URL=http://127.0.0.1:8080 npm run dev -w @nss/web
```

## 배포

`docker compose up --build`로 서버와 PostgreSQL을 함께 띄운다. 화면 주소는 `CORS_ORIGINS`로 허용한다.

## 공개 전에 정해 둔 것

- **요청 횟수 제한**: IP마다 1분에 120번, 가입·로그인·상영관 올리기·짧은 링크 만들기는 20번 (`RATE_GENERAL`, `RATE_STRICT`). 로드 밸런서 뒤라면 `TRUST_PROXY=true`로 `X-Forwarded-For`를 본다.
- **계정 지우기**: `DELETE /api/auth/me` — 로그인 표, 클라우드, 상영관 글과 그 글의 좋아요·신고, 이 계정이 누른 좋아요·신고를 지운다. 짧은 링크는 받은 사람을 위해 남긴다.
- **개인정보**: 이름, 암호를 바꿔 만든 값(BCrypt), 로그인 표, 클라우드·상영관 내용만 저장한다. 이메일·음악 파일·사진은 받지 않는다. 화면의 「계정」 창에 같은 안내가 있다.
- 호스팅 계정, 도메인, HTTPS 인증서, DB 백업은 띄우는 곳에서 직접 정한다.

## API

| 요청 | 하는 일 |
|---|---|
| `POST /api/links` `{data}` → `{code}` | 짧은 링크 만들기 (같은 쇼는 같은 글자) |
| `GET /api/links/{code}` → `{data}` | 짧은 링크 열기 |
| `POST /api/auth/signup`, `/login` `{name, password}` → `{token, name}` | 가입·로그인 |
| `POST /api/auth/logout`, `GET /api/auth/me` | 로그아웃, 내 계정 |
| `GET/PUT/DELETE /api/shows/{id}`, `/api/shells/{id}` | 쇼·내 불꽃 클라우드 저장 (로그인 필요, `Authorization: Bearer`) |
| `GET /api/gallery?kind=show\|shell&sort=new\|top` | 상영관 목록 (숨긴 것 제외) |
| `POST /api/gallery` `{kind, title, data}` | 올리기 (제목·틀불꽃 글자 금칙어 검사, `banned-words.txt`) |
| `GET /api/gallery/{id}`, `POST …/like`, `POST …/report`, `DELETE …` | 구경, 좋아요(다시 누르면 취소), 신고(서로 다른 계정 셋이면 숨김), 내 것 내리기 |
