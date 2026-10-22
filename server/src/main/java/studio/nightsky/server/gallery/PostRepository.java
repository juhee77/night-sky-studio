package studio.nightsky.server.gallery;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PostRepository extends JpaRepository<Post, Long> {
    List<Post> findByKindAndHiddenFalseOrderByCreatedAtDesc(String kind, Pageable page);

    List<Post> findByKindAndHiddenFalseOrderByLikesDescCreatedAtDesc(String kind, Pageable page);

    List<Post> findByAuthorId(Long authorId);
}
