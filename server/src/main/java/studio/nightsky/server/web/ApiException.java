package studio.nightsky.server.web;

import org.springframework.http.HttpStatus;

/** 화면에 그대로 보여 줄 수 있는 오류 (메시지는 한국어) */
public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, what + "을 찾을 수 없습니다.");
    }

    public static ApiException unauthorized() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }

    public static ApiException bad(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, message);
    }
}
