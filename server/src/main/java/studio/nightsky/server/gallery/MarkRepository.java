package studio.nightsky.server.gallery;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MarkRepository extends JpaRepository<Mark, Long> {
    Optional<Mark> findByPostIdAndAccountIdAndKind(Long postId, Long accountId, String kind);

    boolean existsByPostIdAndAccountIdAndKind(Long postId, Long accountId, String kind);

    void deleteByPostId(Long postId);
}
