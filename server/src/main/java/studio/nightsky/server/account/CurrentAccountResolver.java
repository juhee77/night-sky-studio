package studio.nightsky.server.account;

import java.time.Duration;
import java.time.Instant;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import studio.nightsky.server.web.ApiException;

/** Authorization: Bearer 표 → 계정. 표가 없거나 오래되면 401 */
@Component
public class CurrentAccountResolver implements HandlerMethodArgumentResolver {
    /** 로그인은 30일 동안 유지된다 */
    static final Duration SESSION_LIFE = Duration.ofDays(30);

    private final SessionRepository sessions;
    private final AccountRepository accounts;

    public CurrentAccountResolver(SessionRepository sessions, AccountRepository accounts) {
        this.sessions = sessions;
        this.accounts = accounts;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.getParameterType() == CurrentAccount.class;
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mav, NativeWebRequest request, WebDataBinderFactory binder) {
        var header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) throw ApiException.unauthorized();
        var session = sessions.findById(header.substring(7).trim()).orElseThrow(ApiException::unauthorized);
        if (session.getCreatedAt().plus(SESSION_LIFE).isBefore(Instant.now())) {
            sessions.delete(session);
            throw ApiException.unauthorized();
        }
        var account = accounts.findById(session.getAccountId()).orElseThrow(ApiException::unauthorized);
        return new CurrentAccount(account.getId(), account.getName());
    }
}
