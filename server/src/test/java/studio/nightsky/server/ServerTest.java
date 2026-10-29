package studio.nightsky.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
class ServerTest {
    @Autowired
    WebApplicationContext context;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).build();
    }

    private String json(String body) {
        return body.replace('\'', '"');
    }

    private String signup(String name) throws Exception {
        var res = mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'name':'" + name + "','password':'night-sky-123'}")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return res.replaceAll(".*\"token\":\"([0-9a-f]+)\".*", "$1");
    }

    @Test
    void 단계에_도달하면_이름_없이_수만_세고_숫자_화면에_보인다() throws Exception {
        var before = mvc.perform(get("/api/funnel")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long watched = ((Number) com.jayway.jsonpath.JsonPath.read(before, "$[2].reached")).longValue();
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/funnel").contentType(MediaType.APPLICATION_JSON).content(json("{'step':'watch'}"))).andExpect(status().isOk());
        }
        mvc.perform(get("/api/funnel"))
                .andExpect(jsonPath("$[0].step").value("start"))
                .andExpect(jsonPath("$[2].step").value("watch"))
                .andExpect(jsonPath("$[2].reached").value(watched + 2));
        mvc.perform(post("/api/funnel").contentType(MediaType.APPLICATION_JSON).content(json("{'step':'who-am-i'}"))).andExpect(status().isBadRequest());
        var page = mvc.perform(get("/funnel")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(page).contains("어디서 막히나").contains("감상으로 보기");
    }

    @Test
    void 서버가_떴는지_확인할_수_있다() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void 짧은_링크를_만들고_열면_같은_쇼가_나온다() throws Exception {
        var data = "eJxLzs8tKEotLs7Mz7NWMDQwNAIAKTAEyQ";
        var body = mvc.perform(post("/api/links").contentType(MediaType.APPLICATION_JSON).content(json("{'data':'" + data + "'}")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").isString())
                .andReturn().getResponse().getContentAsString();
        var code = body.replaceAll(".*\"code\":\"([^\"]+)\".*", "$1");
        assertThat(code).hasSize(7);
        mvc.perform(get("/api/links/" + code)).andExpect(status().isOk()).andExpect(jsonPath("$.data").value(data));
        // 같은 쇼는 같은 링크
        mvc.perform(post("/api/links").contentType(MediaType.APPLICATION_JSON).content(json("{'data':'" + data + "'}")))
                .andExpect(jsonPath("$.code").value(code));
        mvc.perform(get("/api/links/nope123")).andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("공유 링크을 찾을 수 없습니다."));
        mvc.perform(post("/api/links").contentType(MediaType.APPLICATION_JSON).content(json("{'data':'<script>'}")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 가입하고_로그인하고_나가기() throws Exception {
        var name = "u" + UUID.randomUUID().toString().substring(0, 8);
        var token = signup(name);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(jsonPath("$.name").value(name));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json("{'name':'" + name + "','password':'night-sky-123'}")))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json("{'name':'" + name + "','password':'wrong-pass-1'}")))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json("{'name':'" + name + "','password':'night-sky-123'}")))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json("{'name':'ab','password':'short'}")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("암호는 8자 이상으로 정해 주세요."));
    }

    @Test
    void 쇼와_내_불꽃을_클라우드에_저장하고_내_것만_보인다() throws Exception {
        var a = signup("a" + UUID.randomUUID().toString().substring(0, 8));
        var b = signup("b" + UUID.randomUUID().toString().substring(0, 8));
        mvc.perform(get("/api/shows")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/shows/show-1").header("Authorization", "Bearer " + a).contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'title':'첫 쇼','data':'{}'}")))
                .andExpect(status().isOk());
        mvc.perform(put("/api/shows/show-1").header("Authorization", "Bearer " + a).contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'title':'고친 쇼','data':'{\\'v\\':1}'}")))
                .andExpect(status().isOk());
        mvc.perform(put("/api/shells/s1").header("Authorization", "Bearer " + a).contentType(MediaType.APPLICATION_JSON)
                        .content(json("{'title':'별사탕','data':'{}'}")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/shows").header("Authorization", "Bearer " + a))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("고친 쇼"));
        mvc.perform(get("/api/shows/show-1").header("Authorization", "Bearer " + a)).andExpect(jsonPath("$.data").value("{\"v\":1}"));
        mvc.perform(get("/api/shells").header("Authorization", "Bearer " + a)).andExpect(jsonPath("$[0].id").value("s1"));
        // 다른 계정에는 보이지 않는다
        mvc.perform(get("/api/shows").header("Authorization", "Bearer " + b)).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/shows/show-1").header("Authorization", "Bearer " + b)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/shows/show-1").header("Authorization", "Bearer " + a)).andExpect(status().isOk());
        mvc.perform(get("/api/shows").header("Authorization", "Bearer " + a)).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void 허용한_화면_주소에서만_요청을_받는다() throws Exception {
        mvc.perform(options("/api/links").header("Origin", "http://127.0.0.1:5173").header("Access-Control-Request-Method", "POST"))
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5173"));
        mvc.perform(options("/api/links").header("Origin", "https://evil.example").header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
}
