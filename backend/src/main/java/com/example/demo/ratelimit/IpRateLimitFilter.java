package com.example.demo.ratelimit;

import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * Per-client-IP rate limiting (S1) for the handful of unauthenticated auth endpoints that are
 * cheap to hammer (OTP send, OTP verify, register, invite validation). Registered before
 * {@link com.example.demo.security.TokenAuthenticationFilter} in the security chain since these
 * endpoints are called before a token exists. Client key resolution never trusts a client-supplied
 * header directly — see {@link ClientIpResolver}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class IpRateLimitFilter extends OncePerRequestFilter {

    /**
     * Classifies requests by the same normalized path Spring MVC will actually route on, not the
     * raw {@code getRequestURI()}: decodes percent-encoding (so {@code /%69nitiate-otp} isn't
     * distinct from {@code /initiate-otp}) and strips {@code ;matrix=param} segments (so
     * {@code /initiate-otp;x=y} isn't distinct either) — both are undecoded/unstripped in
     * {@code getRequestURI()}, so matching against it directly let a request dodge its rate-limit
     * rule (and therefore its bucket) while still reaching the controller.
     */
    private static final UrlPathHelper PATH_HELPER = UrlPathHelper.defaultInstance;

    private final RateLimitService rateLimitService;
    private final ClientIpResolver clientIpResolver;
    private final RateLimitProperties properties;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                     @NonNull HttpServletResponse response,
                                     @NonNull FilterChain filterChain) throws ServletException, IOException {
        Rule rule = matchRule(request);
        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String ip = clientIpResolver.resolve(request);
        String bucketKey = "ip:" + rule.name() + ":" + ip;
        ConsumptionProbe probe = rateLimitService.tryConsume(bucketKey, () -> rule.bucketSupplier(properties).get());

        if (!probe.isConsumed()) {
            long retryAfterSeconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1;
            log.warn("Rate limit exceeded for rule={} ip_hash={} retryAfterSeconds={}",
                    rule.name(), RateLimitKeys.hash(ip), retryAfterSeconds);
            RateLimitResponses.writeTooManyRequests(request, response, retryAfterSeconds);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Rule matchRule(HttpServletRequest request) {
        String method = request.getMethod();
        String path = PATH_HELPER.getPathWithinApplication(request);

        if (!"POST".equalsIgnoreCase(method) && !"GET".equalsIgnoreCase(method)) {
            return null;
        }

        if ("POST".equalsIgnoreCase(method)
                && (path.equals("/api/auth/signin/initiate-otp") || path.equals("/api/auth/signup/initiate-otp"))) {
            return Rule.INITIATE_OTP;
        }
        if ("POST".equalsIgnoreCase(method)
                && (path.equals("/api/auth/signin/verify-otp")
                    || path.equals("/api/auth/signup/verify-otp")
                    || path.equals("/api/auth/verify-otp"))) {
            return Rule.VERIFY_OTP;
        }
        if ("POST".equalsIgnoreCase(method) && path.equals("/api/auth/register")) {
            return Rule.REGISTER;
        }
        if ("GET".equalsIgnoreCase(method) && path.equals("/api/auth/validate-invite")) {
            return Rule.VALIDATE_INVITE;
        }
        return null;
    }

    private enum Rule {
        INITIATE_OTP {
            @Override
            java.util.function.Supplier<io.github.bucket4j.Bucket> bucketSupplier(RateLimitProperties props) {
                return () -> RateLimitService.bucketOf(
                        RateLimitService.bandwidth(props.getIp().getInitiateOtpPerHour(), Duration.ofHours(1)),
                        RateLimitService.bandwidth(props.getIp().getInitiateOtpPerDay(), Duration.ofDays(1)));
            }
        },
        VERIFY_OTP {
            @Override
            java.util.function.Supplier<io.github.bucket4j.Bucket> bucketSupplier(RateLimitProperties props) {
                return () -> RateLimitService.bucketOf(
                        RateLimitService.bandwidth(props.getIp().getVerifyOtpPerWindow(),
                                Duration.ofMinutes(props.getIp().getVerifyOtpWindowMinutes())));
            }
        },
        REGISTER {
            @Override
            java.util.function.Supplier<io.github.bucket4j.Bucket> bucketSupplier(RateLimitProperties props) {
                return () -> RateLimitService.bucketOf(
                        RateLimitService.bandwidth(props.getIp().getRegisterPerHour(), Duration.ofHours(1)));
            }
        },
        VALIDATE_INVITE {
            @Override
            java.util.function.Supplier<io.github.bucket4j.Bucket> bucketSupplier(RateLimitProperties props) {
                return () -> RateLimitService.bucketOf(
                        RateLimitService.bandwidth(props.getIp().getValidateInvitePerHour(), Duration.ofHours(1)));
            }
        };

        abstract java.util.function.Supplier<io.github.bucket4j.Bucket> bucketSupplier(RateLimitProperties props);
    }
}
