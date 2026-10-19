package studio.nightsky.server.gallery;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 한 계정이 한 글에 누른 좋아요·신고 (한 번씩만) */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"postId", "accountId", "kind"}))
public class Mark {
    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private Long postId;

    @Column(nullable = false)
    private Long accountId;

    /** like 또는 report */
    @Column(nullable = false, length = 8)
    private String kind;

    protected Mark() {}

    public Mark(Long postId, Long accountId, String kind) {
        this.postId = postId;
        this.accountId = accountId;
        this.kind = kind;
    }
}
