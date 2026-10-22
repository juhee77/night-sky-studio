package studio.nightsky.server.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 요청 횟수 제한: IP마다 1분에 정한 횟수까지. 가입·로그인·올리기·짧은 링크 만들기는 더 엄격하게.
 * 서버 한 대 안의 메모리로 센다 (여러 대로 늘리면 바꿔야 한다).
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {
    private record Window(long minute, int count) {}

    private final int general;
    private final int strict;
    private final boolean trustProxy;
    private final ConcurrentHashMap<String, Window> counts = new ConcurrentHashMap<>();

    public RateLimitFilter(
            @Value("${nss.rate.general:120}") int general,
            @Value("${nss.rate.strict:20}") int strict,
            @Value("${nss.trust-proxy:false}") boolean trustProxy) {
        this.general = general;
        this.strict = strict;
        this.trustProxy = trustProxy;
    }

    static boolean isStrict(HttpServletRequest req) {
        var path = req.getRequestURI();
        return "POST".equals(req.getMethod())
                && (path.startsWith("/api/auth/signup") || path.startsWith("/api/auth/login")
                        || path.equals("/api/gallery") || path.equals("/api/links"));
    }

    private String client(HttpServletRequest req) {
        if (trustProxy) {
            var fwd = req.getHeader("X-Forwarded-For");
            if (fwd != null && !fwd.isBlank()) return fwd.split(",")[0].strip();
        }
        return req.getRemoteAddr();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !req.getRequestURI().startsWith("/api/") || "OPTIONS".equals(req.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        var strictReq = isStrict(req);
        var key = client(req) + (strictReq ? "|strict" : "|all");
        var limit = strictReq ? strict : general;
        var minute = System.currentTimeMillis() / 60_000;
        var w = counts.compute(key, (k, old) -> old == null || old.minute() != minute ? new Window(minute, 1) : new Window(minute, old.count() + 1));
        if (counts.size() > 50_000) counts.entrySet().removeIf((e) -> e.getValue().minute() != minute);
        if (w.count() > limit) {
            res.setStatus(429);
            res.setContentType("application/json;charset=UTF-8");
            res.setHeader("Retry-After", "60");
            res.getOutputStream().write("{\"message\":\"요청이 너무 많습니다. 1분 뒤에 다시 해 주세요.\"}".getBytes(StandardCharsets.UTF_8));
            return;
        }
        chain.doFilter(req, res);
    }
}
