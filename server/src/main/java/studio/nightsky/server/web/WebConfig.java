package studio.nightsky.server.web;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import studio.nightsky.server.account.CurrentAccountResolver;

/** 화면(정적판)이 다른 주소에 있으므로 허용한 주소에서 오는 요청만 받는다. */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    private final String[] origins;
    private final CurrentAccountResolver accounts;

    public WebConfig(@Value("${nss.cors-origins}") String[] origins, CurrentAccountResolver accounts) {
        this.origins = origins;
        this.accounts = accounts;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins(origins).allowedMethods("GET", "POST", "PUT", "DELETE").allowedHeaders("*");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(accounts);
    }
}
