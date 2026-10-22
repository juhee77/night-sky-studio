package studio.nightsky.server.gallery;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/** 금칙어 검사: 띄어쓰기·기호를 끼워 넣어도 찾도록 글자만 남겨 비교한다. 목록은 banned-words.txt. */
@Component
public class BannedWords {
    private final List<String> words;

    public BannedWords() {
        try (var in = new ClassPathResource("banned-words.txt").getInputStream()) {
            words = new String(in.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .map(String::strip)
                    .filter(l -> !l.isEmpty() && !l.startsWith("#"))
                    .map(BannedWords::squash)
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String squash(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** 걸린 낱말 (없으면 null) */
    public String find(String text) {
        if (text == null) return null;
        var s = squash(text);
        for (var w : words) if (!w.isEmpty() && s.contains(w)) return w;
        return null;
    }
}
