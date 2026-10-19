package studio.nightsky.server.account;

/** 요청을 보낸 계정 (컨트롤러 인자로 받으면 로그인이 필요한 요청이 된다) */
public record CurrentAccount(Long id, String name) {}
