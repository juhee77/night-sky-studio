package studio.nightsky.server.link;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import java.time.Instant;

/** 짧은 공유 링크: 짧은 글자 → 쇼를 줄인 글자 (정적판의 #s= 뒤와 같다) */
@Entity
public class ShareLink {
    @Id
    @Column(length = 12)
    private String code;

    @Lob
    @Column(nullable = false)
    private String data;

    private Instant createdAt;

    protected ShareLink() {}

    public ShareLink(String code, String data) {
        this.code = code;
        this.data = data;
        this.createdAt = Instant.now();
    }

    public String getCode() {
        return code;
    }

    public String getData() {
        return data;
    }
}
