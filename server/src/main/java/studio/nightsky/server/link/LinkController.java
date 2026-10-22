package studio.nightsky.server.link;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.security.SecureRandom;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import studio.nightsky.server.web.ApiException;

/** 짧은 공유 링크 만들기와 열기 */
@RestController
@RequestMapping("/api/links")
public class LinkController {
    private static final String ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    private final SecureRandom random = new SecureRandom();
    private final ShareLinkRepository links;

    public LinkController(ShareLinkRepository links) {
        this.links = links;
    }

    public record CreateLink(
            @NotBlank(message = "쇼 데이터가 비어 있습니다.")
            @Size(max = 400_000, message = "쇼가 너무 커서 짧은 링크로 만들 수 없습니다.")
            @Pattern(regexp = "[A-Za-z0-9_-]+", message = "공유 링크 글자가 아닙니다.")
            String data) {}

    @PostMapping
    Map<String, String> create(@Valid @RequestBody CreateLink req) {
        // 같은 쇼는 같은 짧은 링크
        var existing = links.findFirstByData(req.data());
        if (existing.isPresent()) return Map.of("code", existing.get().getCode());
        String code;
        do code = randomCode(7);
        while (links.existsById(code));
        links.save(new ShareLink(code, req.data()));
        return Map.of("code", code);
    }

    @GetMapping("/{code}")
    Map<String, String> open(@PathVariable String code) {
        var link = links.findById(code).orElseThrow(() -> ApiException.notFound("공유 링크"));
        return Map.of("data", link.getData());
    }

    private String randomCode(int n) {
        var sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        return sb.toString();
    }
}
