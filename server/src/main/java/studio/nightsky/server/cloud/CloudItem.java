package studio.nightsky.server.cloud;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/** 클라우드에 저장한 쇼나 내 불꽃 하나. 내용은 화면이 만든 JSON을 그대로 둔다. */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"accountId", "kind", "clientId"}))
public class CloudItem {
    @Id
    @GeneratedValue
    private Long id;

    @Column(nullable = false)
    private Long accountId;

    /** show 또는 shell */
    @Column(nullable = false, length = 8)
    private String kind;

    /** 화면에서 쓰는 id */
    @Column(nullable = false, length = 40)
    private String clientId;

    @Column(length = 80)
    private String title;

    @Lob
    @Column(nullable = false)
    private String data;

    private Instant updatedAt;

    protected CloudItem() {}

    public CloudItem(Long accountId, String kind, String clientId) {
        this.accountId = accountId;
        this.kind = kind;
        this.clientId = clientId;
    }

    public void update(String title, String data) {
        this.title = title;
        this.data = data;
        this.updatedAt = Instant.now();
    }

    public String getClientId() {
        return clientId;
    }

    public String getTitle() {
        return title;
    }

    public String getData() {
        return data;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
