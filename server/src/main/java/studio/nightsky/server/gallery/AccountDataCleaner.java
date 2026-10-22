package studio.nightsky.server.gallery;

import org.springframework.stereotype.Component;
import studio.nightsky.server.account.AccountData;
import studio.nightsky.server.cloud.CloudItemRepository;

/** 계정을 지울 때: 클라우드에 저장한 쇼·내 불꽃, 상영관에 올린 글과 그 글의 좋아요·신고, 이 계정이 누른 좋아요·신고 */
@Component
public class AccountDataCleaner implements AccountData {
    private final CloudItemRepository cloud;
    private final PostRepository posts;
    private final MarkRepository marks;

    public AccountDataCleaner(CloudItemRepository cloud, PostRepository posts, MarkRepository marks) {
        this.cloud = cloud;
        this.posts = posts;
        this.marks = marks;
    }

    @Override
    public void deleteAll(Long accountId) {
        cloud.deleteByAccountId(accountId);
        for (var p : posts.findByAuthorId(accountId)) {
            marks.deleteByPostId(p.getId());
            posts.delete(p);
        }
        // 남의 글에 누른 좋아요는 그 글의 좋아요 수에서도 뺀다
        for (var m : marks.findByAccountId(accountId)) {
            if (!"like".equals(m.getKind())) continue;
            posts.findById(m.getPostId()).ifPresent((p) -> {
                p.like(-1);
                posts.save(p);
            });
        }
        marks.deleteByAccountId(accountId);
    }
}
