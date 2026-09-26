package com.example.demo.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.Refill;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.function.Supplier;

/**
 * In-memory, single-instance rate limiter (Bucket4j). Buckets live in a Caffeine cache bounded
 * by size and idle time so a flood of distinct keys (spoofed IPs, junk phone numbers) can't grow
 * memory without limit — old/idle buckets are simply evicted and rebuilt fresh on next use,
 * which is fine for rate limiting (worst case it's slightly more permissive right after eviction).
 */
@Service
public class RateLimitService {

    private final Cache<String, Bucket> buckets;

    public RateLimitService(RateLimitProperties properties) {
        this.buckets = Caffeine.newBuilder()
                .maximumSize(properties.getMaxTrackedKeys())
                .expireAfterAccess(Duration.ofDays(2))
                .build();
    }

    /** Builds (or reuses) the bucket for {@code key} and attempts to consume one token from it. */
    public ConsumptionProbe tryConsume(String key, Supplier<Bucket> bucketSupplier) {
        Bucket bucket = buckets.get(key, k -> bucketSupplier.get());
        return bucket.tryConsumeAndReturnRemaining(1);
    }

    public static Bucket bucketOf(Bandwidth... bandwidths) {
        io.github.bucket4j.local.LocalBucketBuilder builder = Bucket.builder();
        for (Bandwidth bandwidth : bandwidths) {
            builder.addLimit(bandwidth);
        }
        return builder.build();
    }

    public static Bandwidth bandwidth(long capacity, Duration period) {
        return Bandwidth.classic(capacity, Refill.intervally(capacity, period));
    }
}
