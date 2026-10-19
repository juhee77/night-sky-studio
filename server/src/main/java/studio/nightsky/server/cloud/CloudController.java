package studio.nightsky.server.cloud;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.nightsky.server.account.CurrentAccount;
import studio.nightsky.server.web.ApiException;

/** 쇼(/api/shows)와 내 불꽃(/api/shells) 클라우드 저장. 내 것만 보이고 고칠 수 있다. */
@RestController
@RequestMapping("/api")
public class CloudController {
    /** 계정마다 둘 수 있는 개수 */
    static final int LIMIT = 200;

    private final CloudItemRepository items;

    public CloudController(CloudItemRepository items) {
        this.items = items;
    }

    public record Save(
            @Size(max = 80, message = "제목이 너무 깁니다.") String title,
            @NotBlank(message = "내용이 비어 있습니다.") @Size(max = 2_000_000, message = "너무 커서 저장할 수 없습니다.") String data) {}

    public record Summary(String id, String title, Instant updatedAt) {}

    private static String kind(String path) {
        return switch (path) {
            case "shows" -> "show";
            case "shells" -> "shell";
            default -> throw ApiException.notFound("저장소");
        };
    }

    private static void checkId(String id) {
        if (!id.matches("[A-Za-z0-9_.:-]{1,40}")) throw ApiException.bad("id가 올바르지 않습니다.");
    }

    @GetMapping("/{path:shows|shells}")
    List<Summary> list(CurrentAccount me, @PathVariable String path) {
        return items.findByAccountIdAndKindOrderByUpdatedAtDesc(me.id(), kind(path)).stream()
                .map(i -> new Summary(i.getClientId(), i.getTitle(), i.getUpdatedAt()))
                .toList();
    }

    @GetMapping("/{path:shows|shells}/{id}")
    Map<String, Object> get(CurrentAccount me, @PathVariable String path, @PathVariable String id) {
        var item = items.findByAccountIdAndKindAndClientId(me.id(), kind(path), id).orElseThrow(() -> ApiException.notFound("저장한 것"));
        return Map.of("id", item.getClientId(), "title", item.getTitle() == null ? "" : item.getTitle(), "data", item.getData());
    }

    @PutMapping("/{path:shows|shells}/{id}")
    @Transactional
    Map<String, Object> put(CurrentAccount me, @PathVariable String path, @PathVariable String id, @Valid @RequestBody Save req) {
        checkId(id);
        var k = kind(path);
        var item = items.findByAccountIdAndKindAndClientId(me.id(), k, id).orElse(null);
        if (item == null) {
            if (items.countByAccountIdAndKind(me.id(), k) >= LIMIT) throw ApiException.bad("클라우드에 더 저장할 수 없습니다 (" + LIMIT + "개까지).");
            item = new CloudItem(me.id(), k, id);
        }
        item.update(req.title(), req.data());
        items.save(item);
        return Map.of("id", id, "updatedAt", item.getUpdatedAt().toString());
    }

    @DeleteMapping("/{path:shows|shells}/{id}")
    @Transactional
    Map<String, Object> delete(CurrentAccount me, @PathVariable String path, @PathVariable String id) {
        items.findByAccountIdAndKindAndClientId(me.id(), kind(path), id).ifPresent(items::delete);
        return Map.of("ok", true);
    }
}
