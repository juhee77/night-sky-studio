package studio.nightsky.server.gallery;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.zip.DataFormatException;
import java.util.zip.Inflater;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import studio.nightsky.server.account.CurrentAccount;
import studio.nightsky.server.web.ApiException;

/**
 * 상영관: 쇼와 내 불꽃을 올리고, 구경하고, 좋아요를 누르고, 신고한다.
 * 쇼는 공유 링크 글자(#s= 뒤) 그대로, 내 불꽃은 설계 JSON으로 받는다.
 */
@RestController
@RequestMapping("/api/gallery")
public class GalleryController {
    /** 서로 다른 계정 셋이 신고하면 숨긴다 */
    static final int HIDE_AT = 3;

    private final PostRepository posts;
    private final MarkRepository marks;
    private final BannedWords banned;

    public GalleryController(PostRepository posts, MarkRepository marks, BannedWords banned) {
        this.posts = posts;
        this.marks = marks;
        this.banned = banned;
    }

    public record Upload(
            @Pattern(regexp = "show|shell", message = "올릴 수 있는 것은 쇼와 내 불꽃뿐입니다.") String kind,
            @NotBlank(message = "제목을 적어 주세요.") @Size(max = 60, message = "제목은 60자까지입니다.") String title,
            @NotBlank(message = "내용이 비어 있습니다.") @Size(max = 400_000, message = "너무 커서 올릴 수 없습니다.") String data,
            /** 이번 주 도전에 내는 쇼면 주차 (없어도 된다) */
            @Pattern(regexp = WEEK, message = "도전 주차가 올바르지 않습니다.") String challenge) {}

    /** 도전 주차: 2026-W44 */
    static final String WEEK = "\\d{4}-W\\d{2}";

    public record Item(Long id, String kind, String title, String author, int likes, boolean liked, boolean mine, Instant createdAt, String challenge) {}

    @PostMapping
    Map<String, Object> upload(CurrentAccount me, @Valid @RequestBody Upload req) {
        // 제목과 내용(틀불꽃 글자, 불꽃 이름 포함) 모두 금칙어를 본다.
        var word = banned.find(req.title());
        if (word == null) word = banned.find(readable(req.kind(), req.data()));
        if (word != null) throw ApiException.bad("쓸 수 없는 말이 들어 있습니다. 제목이나 틀불꽃 글자를 고쳐 주세요.");
        if (req.challenge() != null && !"show".equals(req.kind())) throw ApiException.bad("도전에는 쇼만 낼 수 있습니다.");
        var post = posts.save(new Post(req.kind(), req.title().strip(), me.id(), me.name(), req.data(), req.challenge()));
        return Map.of("id", post.getId());
    }

    @GetMapping
    List<Item> list(CurrentAccount me, @RequestParam(defaultValue = "show") String kind, @RequestParam(defaultValue = "new") String sort,
            @RequestParam(required = false) String challenge) {
        var page = PageRequest.of(0, 60);
        // 이번 주 도전: 그 주에 낸 쇼만, 좋아요 많은 순 (순위)
        if (challenge != null) {
            if (!challenge.matches(WEEK)) throw ApiException.bad("도전 주차가 올바르지 않습니다.");
            return posts.findByKindAndChallengeAndHiddenFalseOrderByLikesDescCreatedAtDesc("show", challenge, page).stream().map(p -> item(p, me)).toList();
        }
        var list = "top".equals(sort)
                ? posts.findByKindAndHiddenFalseOrderByLikesDescCreatedAtDesc(kind, page)
                : posts.findByKindAndHiddenFalseOrderByCreatedAtDesc(kind, page);
        return list.stream().map(p -> item(p, me)).toList();
    }

    @GetMapping("/{id}")
    Map<String, Object> get(CurrentAccount me, @PathVariable Long id) {
        var p = visible(id);
        return Map.of("item", item(p, me), "data", p.getData());
    }

    @PostMapping("/{id}/like")
    @Transactional
    Map<String, Object> like(CurrentAccount me, @PathVariable Long id) {
        var p = visible(id);
        var mark = marks.findByPostIdAndAccountIdAndKind(id, me.id(), "like");
        if (mark.isPresent()) {
            marks.delete(mark.get());
            p.like(-1);
        } else {
            marks.save(new Mark(id, me.id(), "like"));
            p.like(1);
        }
        posts.save(p);
        return Map.of("likes", p.getLikes(), "liked", mark.isEmpty());
    }

    @PostMapping("/{id}/report")
    @Transactional
    Map<String, Object> report(CurrentAccount me, @PathVariable Long id) {
        var p = visible(id);
        if (p.getAuthorId().equals(me.id())) throw ApiException.bad("내가 올린 것은 신고할 수 없습니다.");
        if (!marks.existsByPostIdAndAccountIdAndKind(id, me.id(), "report")) {
            marks.save(new Mark(id, me.id(), "report"));
            p.report(HIDE_AT);
            posts.save(p);
        }
        return Map.of("hidden", p.isHidden());
    }

    @DeleteMapping("/{id}")
    @Transactional
    Map<String, Object> delete(CurrentAccount me, @PathVariable Long id) {
        var p = posts.findById(id).orElseThrow(() -> ApiException.notFound("올린 것"));
        if (!p.getAuthorId().equals(me.id())) throw new ApiException(HttpStatus.FORBIDDEN, "내가 올린 것만 내릴 수 있습니다.");
        marks.deleteByPostId(id);
        posts.delete(p);
        return Map.of("ok", true);
    }

    private Post visible(Long id) {
        return posts.findById(id).filter(p -> !p.isHidden()).orElseThrow(() -> ApiException.notFound("올린 것"));
    }

    private Item item(Post p, CurrentAccount me) {
        return new Item(p.getId(), p.getKind(), p.getTitle(), p.getAuthorName(), p.getLikes(),
                marks.existsByPostIdAndAccountIdAndKind(p.getId(), me.id(), "like"), p.getAuthorId().equals(me.id()), p.getCreatedAt(),
                p.getChallenge());
    }

    /** 금칙어를 찾을 수 있는 글자: 쇼는 공유 링크 글자를 풀어 JSON으로, 내 불꽃은 JSON 그대로 */
    static String readable(String kind, String data) {
        if (!"show".equals(kind)) return data;
        try {
            var bytes = Base64.getUrlDecoder().decode(data);
            var inflater = new Inflater(true);
            inflater.setInput(bytes);
            var out = new ByteArrayOutputStream();
            var buf = new byte[8192];
            while (!inflater.finished()) {
                int n = inflater.inflate(buf);
                if (n == 0 && (inflater.needsInput() || inflater.needsDictionary())) break;
                out.write(buf, 0, n);
                if (out.size() > 5_000_000) throw ApiException.bad("쇼가 너무 큽니다.");
            }
            inflater.end();
            return out.toString(StandardCharsets.UTF_8);
        } catch (IllegalArgumentException | DataFormatException e) {
            throw ApiException.bad("공유 링크 글자가 아닙니다.");
        }
    }
}
