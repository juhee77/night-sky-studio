package studio.nightsky.server.funnel;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import studio.nightsky.server.web.ApiException;

/**
 * 어디서 막히는지 재기: 화면이 단계별 열기의 단계에 처음 도달할 때 한 번씩 알려 주면 그 단계의 수를 하나 올린다.
 * 계정·IP·브라우저 표시 같은 것은 받지도 남기지도 않는다 (단계 이름만).
 * 숫자는 로컬 서버의 /funnel 화면에서 본다.
 */
@RestController
public class FunnelController {
    /** 단계 이름과 화면에 보일 말 (화면 progress.ts의 할 일 순서) */
    static final Map<String, String> STEPS = new LinkedHashMap<>();

    static {
        STEPS.put("start", "처음 열기");
        STEPS.put("auto", "자동 연출로 첫 쇼");
        STEPS.put("watch", "감상으로 보기");
        STEPS.put("shell-saved", "공작소에서 내 불꽃 저장");
        STEPS.put("delivered", "의뢰 납품");
        STEPS.put("build-saved", "제작 공방에서 알 저장");
    }

    private final StepCountRepository counts;

    public FunnelController(StepCountRepository counts) {
        this.counts = counts;
    }

    public record Reach(@NotBlank String step) {}

    public record Row(String step, String label, long reached) {}

    @PostMapping("/api/funnel")
    @Transactional
    public synchronized Map<String, Object> reach(@Valid @RequestBody Reach req) {
        if (!STEPS.containsKey(req.step())) throw ApiException.bad("모르는 단계입니다.");
        var c = counts.findById(req.step()).orElseGet(() -> new StepCount(req.step()));
        c.add();
        counts.save(c);
        return Map.of("ok", true);
    }

    @GetMapping("/api/funnel")
    public List<Row> rows() {
        return STEPS.entrySet().stream()
                .map((e) -> new Row(e.getKey(), e.getValue(), counts.findById(e.getKey()).map(StepCount::getReached).orElse(0L)))
                .toList();
    }

    /** 로컬에서 보는 간단한 숫자 화면: 단계마다 도달 수와 앞 단계에서 넘어온 비율 */
    @GetMapping(value = "/funnel", produces = MediaType.TEXT_HTML_VALUE)
    public String page() {
        var rows = rows();
        var sb = new StringBuilder("""
                <!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
                <title>어디서 막히나</title><style>
                body{font:15px/1.5 system-ui,sans-serif;background:#0b0c1d;color:#e8e6f5;margin:0;padding:24px}
                h1{font-size:20px;margin:0 0 4px}p{color:#a6a3bd;margin:0 0 16px}
                table{border-collapse:collapse;width:100%;max-width:640px}td,th{padding:8px 10px;border-bottom:1px solid #2a2b45;text-align:left}
                td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}.bar{height:8px;background:#fb923c;border-radius:4px}
                .drop{color:#ffb4ad}</style></head><body>
                <h1>어디서 막히나</h1><p>단계마다 처음 도달한 브라우저 수입니다. 누구인지는 남기지 않습니다.</p>
                <table><thead><tr><th>단계</th><th class="num">도달</th><th class="num">앞 단계에서</th><th style="width:30%"></th></tr></thead><tbody>
                """);
        long first = rows.isEmpty() ? 0 : rows.get(0).reached();
        long prev = -1;
        for (var r : rows) {
            String pass = prev < 0 ? "–" : prev == 0 ? "–" : Math.round(100.0 * r.reached() / prev) + "%";
            boolean drop = prev > 0 && r.reached() * 2 < prev;
            double w = first == 0 ? 0 : Math.min(100, 100.0 * r.reached() / first);
            sb.append("<tr><td>").append(r.label()).append("</td><td class=\"num\">").append(r.reached())
                    .append("</td><td class=\"num").append(drop ? " drop" : "").append("\">").append(pass)
                    .append("</td><td><div class=\"bar\" style=\"width:").append(String.format("%.1f", w)).append("%\"></div></td></tr>");
            prev = r.reached();
        }
        return sb.append("</tbody></table></body></html>").toString();
    }
}
