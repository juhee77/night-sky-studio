package studio.nightsky.server.link;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShareLinkRepository extends JpaRepository<ShareLink, String> {
    Optional<ShareLink> findFirstByData(String data);
}
