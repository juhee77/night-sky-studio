package studio.nightsky.server.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;

/** 로그인 표: 화면은 이 글자를 Authorization: Bearer 로 보낸다 */
@Entity
public class Session {
    @Id
    @Column(length = 64)
    private String token;

    @Column(nullable = false)
    private Long accountId;

    private Instant createdAt;

    protected Session() {}

    public Session(String token, Long accountId) {
        this.token = token;
        this.accountId = accountId;
        this.createdAt = Instant.now();
    }

    public String getToken() {
        return token;
    }

    public Long getAccountId() {
        return accountId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
