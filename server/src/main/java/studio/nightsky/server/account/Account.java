package studio.nightsky.server.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import java.time.Instant;

/** 계정: 이름과 암호 (암호는 BCrypt로 바꿔 둔다) */
@Entity
public class Account {
    @Id
    @GeneratedValue
    private Long id;

    @Column(unique = true, nullable = false, length = 24)
    private String name;

    @Column(nullable = false)
    private String passwordHash;

    private Instant createdAt;

    protected Account() {}

    public Account(String name, String passwordHash) {
        this.name = name;
        this.passwordHash = passwordHash;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }
}
