package com.example.demo.ratelimit;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(RateLimitProperties.class)
public class RateLimitConfig {

    /**
     * {@link IpRateLimitFilter} and {@link UserRateLimitFilter} are {@code @Component}-annotated
     * {@code Filter}s, which Spring Boot would otherwise ALSO auto-register as generic servlet
     * container filters running on every request — on top of the explicit
     * {@code addFilterBefore}/{@code addFilterAfter} wiring into the Spring Security chain in
     * {@link com.example.demo.security.SecurityConfig}. That double execution silently
     * double-consumes rate-limit tokens, and (worse) when a request trips the limit and the
     * filter short-circuits without calling the chain, the two executions disagree about where
     * the response is written, corrupting it. Disabling the container-level auto-registration
     * leaves exactly the one, deliberately-ordered invocation inside the security chain.
     */
    @Bean
    public FilterRegistrationBean<IpRateLimitFilter> ipRateLimitFilterRegistration(IpRateLimitFilter filter) {
        FilterRegistrationBean<IpRateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<UserRateLimitFilter> userRateLimitFilterRegistration(UserRateLimitFilter filter) {
        FilterRegistrationBean<UserRateLimitFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
