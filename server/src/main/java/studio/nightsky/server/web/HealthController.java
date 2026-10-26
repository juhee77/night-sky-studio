package studio.nightsky.server.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 서버가 떴는지 확인하는 곳 (로컬 실행 스크립트가 기다릴 때 쓴다) */
@RestController
class HealthController {
    @GetMapping("/api/health")
    Map<String, Object> health() {
        return Map.of("ok", true);
    }
}
