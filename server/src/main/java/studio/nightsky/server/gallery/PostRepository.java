package studio.nightsky.server.gallery;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findByKindAndHiddenFalseOrderByCreatedAtDesc(String kind, Pageable page);

    List<Post> findByKindAndHiddenFalseOrderByLikesDescCreatedAtDesc(String kind, Pageable page);

    /** 이번 주 도전 순위: 좋아요 많은 순 */
    List<Post> findByKindAndChallengeAndHiddenFalseOrderByLikesDescCreatedAtDesc(String kind, String challenge, Pageable page);

    List<Post> findByAuthorId(Long authorId);
}
