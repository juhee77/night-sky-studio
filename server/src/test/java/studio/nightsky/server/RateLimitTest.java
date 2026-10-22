package studio.nightsky.server;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import studio.nightsky.server.web.RateLimitFilter;

@SpringBootTest(properties = {"nss.rate.general=10", "nss.rate.strict=3"})
class RateLimitTest {
    @Autowired
    WebApplicationContext context;

    @Autowired
    RateLimitFilter rateLimit;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(rateLimit).build();
    }

    @Test
    void 가입은_1분에_정한_횟수까지만_받는다() throws Exception {
        for (int i = 0; i < 3; i++) {
            mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"nobody\",\"password\":\"night-sky-123\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"nobody\",\"password\":\"night-sky-123\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("요청이 너무 많습니다. 1분 뒤에 다시 해 주세요."));
        // 엄격한 칸과 일반 칸은 따로 센다
        mvc.perform(get("/api/links/none00a")).andExpect(status().isNotFound());
    }
}
