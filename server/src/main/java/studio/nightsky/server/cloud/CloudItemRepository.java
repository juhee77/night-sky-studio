package studio.nightsky.server.cloud;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CloudItemRepository extends JpaRepository<CloudItem, Long> {
    List<CloudItem> findByAccountIdAndKindOrderByUpdatedAtDesc(Long accountId, String kind);

    Optional<CloudItem> findByAccountIdAndKindAndClientId(Long accountId, String kind, String clientId);

    long countByAccountIdAndKind(Long accountId, String kind);
}
