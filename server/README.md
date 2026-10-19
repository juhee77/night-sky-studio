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

## API

| 요청 | 하는 일 |
|---|---|
| `POST /api/links` `{data}` → `{code}` | 짧은 링크 만들기 (같은 쇼는 같은 글자) |
| `GET /api/links/{code}` → `{data}` | 짧은 링크 열기 |
| `POST /api/auth/signup`, `/login` `{name, password}` → `{token, name}` | 가입·로그인 |
| `POST /api/auth/logout`, `GET /api/auth/me` | 로그아웃, 내 계정 |
| `GET/PUT/DELETE /api/shows/{id}`, `/api/shells/{id}` | 쇼·내 불꽃 클라우드 저장 (로그인 필요, `Authorization: Bearer`) |
