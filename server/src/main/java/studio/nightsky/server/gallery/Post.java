package studio.nightsky.server.gallery;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import java.time.Instant;

/** 상영관에 올린 쇼나 내 불꽃 하나 */
@Entity
public class Post {
    @Id
    @GeneratedValue
    private Long id;

    /** show(공유 링크 글자) 또는 shell(내 불꽃 JSON) */
    @Column(nullable = false, length = 8)
    private String kind;

    @Column(nullable = false, length = 60)
    private String title;

    @Column(nullable = false)
    private Long authorId;

    @Column(nullable = false, length = 24)
    private String authorName;

    @Lob
    @Column(nullable = false)
    private String data;

    private int likes;
    private int reports;
    /** 신고가 쌓이면 숨긴다 */
    private boolean hidden;
    private Instant createdAt;

    protected Post() {}

    public Post(String kind, String title, Long authorId, String authorName, String data) {
        this.kind = kind;
        this.title = title;
        this.authorId = authorId;
        this.authorName = authorName;
        this.data = data;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getKind() { return kind; }
    public String getTitle() { return title; }
    public Long getAuthorId() { return authorId; }
    public String getAuthorName() { return authorName; }
    public String getData() { return data; }
    public int getLikes() { return likes; }
    public boolean isHidden() { return hidden; }
    public Instant getCreatedAt() { return createdAt; }

    void like(int delta) {
        likes = Math.max(0, likes + delta);
    }

    void report(int hideAt) {
        reports++;
        if (reports >= hideAt) hidden = true;
    }
}
