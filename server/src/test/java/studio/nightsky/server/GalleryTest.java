package studio.nightsky.server;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import java.util.zip.Deflater;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
class GalleryTest {
    @Autowired
    WebApplicationContext context;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String signup() throws Exception {
        var name = "g" + UUID.randomUUID().toString().substring(0, 10);
        var res = mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\",\"password\":\"night-sky-123\"}"))
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + res.replaceAll(".*\"token\":\"([0-9a-f]+)\".*", "$1");
    }

    /** 화면의 공유 링크처럼: JSON → deflate-raw → base64url */
    static String pack(String json) {
        var d = new Deflater(Deflater.DEFAULT_COMPRESSION, true);
        d.setInput(json.getBytes(StandardCharsets.UTF_8));
        d.finish();
        var out = new ByteArrayOutputStream();
        var buf = new byte[4096];
        while (!d.finished()) out.write(buf, 0, d.deflate(buf));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(out.toByteArray());
    }

    private long upload(String auth, String kind, String title, String data) throws Exception {
        return upload(auth, kind, title, data, null);
    }

    private long upload(String auth, String kind, String title, String data, String challenge) throws Exception {
        var week = challenge == null ? "" : ",\"challenge\":\"" + challenge + "\"";
        var res = mvc.perform(post("/api/gallery").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"" + kind + "\",\"title\":\"" + title + "\",\"data\":\"" + data.replace("\"", "\\\"") + "\"" + week + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return Long.parseLong(res.replaceAll("\\D", ""));
    }

    @Test
    void 이번_주_도전에_낸_쇼는_그_주차로만_모이고_좋아요_순으로_줄선다() throws Exception {
        var a = signup();
        var b = signup();
        var show = pack("{\"v\":1,\"ti\":\"도전\"}");
        var week = "2026-W44";
        long first = upload(a, "show", "도전 하나", show, week);
        long second = upload(b, "show", "도전 둘", show, week);
        upload(a, "show", "다른 주", show, "2026-W43");
        upload(a, "show", "그냥 쇼", show);
        mvc.perform(post("/api/gallery/" + second + "/like").header("Authorization", a)).andExpect(status().isOk());
        mvc.perform(get("/api/gallery").param("challenge", week).header("Authorization", b))
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(second))
                .andExpect(jsonPath("$[1].id").value(first))
                .andExpect(jsonPath("$[0].challenge").value(week));
        // 주차 모양이 아니면 받지 않는다
        mvc.perform(get("/api/gallery").param("challenge", "이번주").header("Authorization", b)).andExpect(status().isBadRequest());
    }

    @Test
    void 올린_쇼를_다른_계정에서_보고_좋아요를_누르고_담을_수_있다() throws Exception {
        var a = signup();
        var b = signup();
        var show = pack("{\"v\":1,\"ti\":\"여름밤\",\"ex\":[[0,\"t\",\"안녕\"]]}");
        var id = upload(a, "show", "여름밤 불꽃", show);
        upload(a, "shell", "별사탕", "{\"id\":\"s1\",\"name\":\"별사탕\"}");
        mvc.perform(get("/api/gallery").param("kind", "show").header("Authorization", b))
                .andExpect(jsonPath("$[0].title").value("여름밤 불꽃"))
                .andExpect(jsonPath("$[0].mine").value(false));
        mvc.perform(get("/api/gallery/" + id).header("Authorization", b)).andExpect(jsonPath("$.data").value(show));
        mvc.perform(post("/api/gallery/" + id + "/like").header("Authorization", b)).andExpect(jsonPath("$.likes").value(1));
        mvc.perform(get("/api/gallery").param("kind", "shell").header("Authorization", b)).andExpect(jsonPath("$[0].title").value("별사탕"));
        // 좋아요를 한 번 더 누르면 취소
        mvc.perform(post("/api/gallery/" + id + "/like").header("Authorization", b)).andExpect(jsonPath("$.likes").value(0));
        // 남의 것은 내릴 수 없다
        mvc.perform(delete("/api/gallery/" + id).header("Authorization", b)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/gallery/" + id).header("Authorization", a)).andExpect(status().isOk());
    }

    @Test
    void 금칙어는_제목과_틀불꽃_글자에서_막는다() throws Exception {
        var a = signup();
        mvc.perform(post("/api/gallery").header("Authorization", a).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"shell\",\"title\":\"시 발 불꽃\",\"data\":\"{}\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("쓸 수 없는 말이 들어 있습니다. 제목이나 틀불꽃 글자를 고쳐 주세요."));
        var bad = pack("{\"v\":1,\"ex\":[[0,\"t\",\"F.U.C.K\"]]}");
        mvc.perform(post("/api/gallery").header("Authorization", a).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"show\",\"title\":\"좋은 쇼\",\"data\":\"" + bad + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 세_계정이_신고하면_숨겨진다() throws Exception {
        var author = signup();
        var id = upload(author, "show", "신고될 쇼", pack("{\"v\":1}"));
        mvc.perform(post("/api/gallery/" + id + "/report").header("Authorization", author)).andExpect(status().isBadRequest());
        var r1 = signup();
        mvc.perform(post("/api/gallery/" + id + "/report").header("Authorization", r1)).andExpect(jsonPath("$.hidden").value(false));
        // 같은 계정이 여러 번 눌러도 한 번
        mvc.perform(post("/api/gallery/" + id + "/report").header("Authorization", r1)).andExpect(jsonPath("$.hidden").value(false));
        mvc.perform(post("/api/gallery/" + id + "/report").header("Authorization", signup())).andExpect(jsonPath("$.hidden").value(false));
        mvc.perform(post("/api/gallery/" + id + "/report").header("Authorization", signup())).andExpect(jsonPath("$.hidden").value(true));
        mvc.perform(get("/api/gallery/" + id).header("Authorization", r1)).andExpect(status().isNotFound());
    }

    @Test
    void 계정을_지우면_클라우드와_상영관의_것도_지워지고_누른_좋아요도_빠진다() throws Exception {
        var a = signup();
        var b = signup();
        var mine = upload(a, "show", "지울 쇼", pack("{\"v\":1}"));
        var theirs = upload(b, "show", "남의 쇼", pack("{\"v\":1}"));
        mvc.perform(post("/api/gallery/" + theirs + "/like").header("Authorization", a)).andExpect(jsonPath("$.likes").value(1));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/shows/s1").header("Authorization", a)
                .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"t\",\"data\":\"{}\"}")).andExpect(status().isOk());
        mvc.perform(delete("/api/auth/me").header("Authorization", a)).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", a)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/gallery/" + mine).header("Authorization", b)).andExpect(status().isNotFound());
        mvc.perform(get("/api/gallery/" + theirs).header("Authorization", b)).andExpect(jsonPath("$.item.likes").value(0));
    }
}
