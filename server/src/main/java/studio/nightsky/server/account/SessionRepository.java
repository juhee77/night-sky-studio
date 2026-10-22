package studio.nightsky.server.account;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionRepository extends JpaRepository<Session, String> {
    void deleteByAccountId(Long accountId);
}
