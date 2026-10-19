package studio.nightsky.server.account;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.nightsky.server.web.ApiException;

/** 가입·로그인·로그아웃. 이메일은 받지 않는다 (이름과 암호만). */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccountRepository accounts;
    private final SessionRepository sessions;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    public AuthController(AccountRepository accounts, SessionRepository sessions) {
        this.accounts = accounts;
        this.sessions = sessions;
    }

    public record Credentials(
            @NotBlank(message = "이름을 적어 주세요.")
            @Size(min = 2, max = 24, message = "이름은 2~24자로 적어 주세요.")
            @Pattern(regexp = "[\\p{L}\\p{N}_.-]+", message = "이름에는 글자, 숫자, _ . - 만 쓸 수 있습니다.")
            String name,
            @NotBlank(message = "암호를 적어 주세요.")
            @Size(min = 8, max = 72, message = "암호는 8자 이상으로 정해 주세요.")
            String password) {}

    @PostMapping("/signup")
    Map<String, Object> signup(@Valid @RequestBody Credentials c) {
        if (accounts.existsByName(c.name())) throw new ApiException(HttpStatus.CONFLICT, "이미 쓰는 이름입니다.");
        var account = accounts.save(new Account(c.name(), encoder.encode(c.password())));
        return issue(account);
    }

    @PostMapping("/login")
    Map<String, Object> login(@Valid @RequestBody Credentials c) {
        var account = accounts.findByName(c.name())
                .filter(a -> encoder.matches(c.password(), a.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "이름이나 암호가 맞지 않습니다."));
        return issue(account);
    }

    @PostMapping("/logout")
    Map<String, Object> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header != null && header.startsWith("Bearer ")) sessions.deleteById(header.substring(7).trim());
        return Map.of("ok", true);
    }

    @GetMapping("/me")
    Map<String, Object> me(CurrentAccount me) {
        return Map.of("name", me.name());
    }

    private Map<String, Object> issue(Account account) {
        var bytes = new byte[24];
        random.nextBytes(bytes);
        var token = HexFormat.of().formatHex(bytes);
        sessions.save(new Session(token, account.getId()));
        return Map.of("token", token, "name", account.getName());
    }
}
