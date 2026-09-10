package com.example.demo.service;

import com.example.demo.map.HilbertCurve;
import com.example.demo.model.Neighborhood;
import com.example.demo.model.User;
import com.example.demo.repository.NeighborhoodRepository;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Owns map placement: every user sits at a permanent point on a single shared Hilbert
 * curve, assigned once and (with one deliberate exception — see relocateToNewNeighborhood)
 * never revisited. A neighborhood's sequential creation order occupies the high-order bits
 * of a member's combined index; the member's join-order within that neighborhood occupies
 * the low bits. Both are plain sequential counters — HilbertCurve.d2xy at the combined
 * order is what turns that into an actual (x, y).
 *
 * Bit budget: combined index must fit in a positive long/bigint (63 usable bits), so
 * NEIGHBORHOOD_ORDER + LOCAL_ORDER must stay comfortably under 31.
 */
@Service
@RequiredArgsConstructor
public class PlacementService {

    /** ~268M possible neighborhoods (2^(2*14)) — generous headroom over any realistic count. */
    public static final int NEIGHBORHOOD_ORDER = 14;
    /**
     * 4,096 possible members per neighborhood (2^(2*6)) — comparable to a large company or
     * community, a real ceiling a popular invite chain could plausibly reach. Neighborhood
     * capacity and neighborhood-to-neighborhood spacing are the same knob (both scale as
     * 2^LOCAL_ORDER, since every neighborhood reserves a fixed-size block on the shared curve
     * regardless of how many members actually land in it) — was 16, then 13 (spacing 8192),
     * both of which left tiny neighborhoods (single digits to tens of members) still reserving
     * blocks thousands of units wide, dwarfing the ~1-10 unit spread of their actual members.
     * 6 (spacing 64) was chosen deliberately over a larger, safer-feeling cap: once a
     * neighborhood hits capacity, joinNeighborhood below simply founds the new member their
     * own neighborhood instead of overflowing localIndex into the neighborhood-id bits — an
     * accepted, explicit trade of tighter clustering for a real (if rare) cap.
     */
    public static final int LOCAL_ORDER = 6;
    private static final int LOCAL_BITS = 2 * LOCAL_ORDER;
    private static final long NEIGHBORHOOD_CAPACITY = 1L << LOCAL_BITS;

    /** Public so query code (e.g. the map viewport endpoint) can decompose boxes at the same order positions are placed at. */
    public static final int COMBINED_ORDER = NEIGHBORHOOD_ORDER + LOCAL_ORDER;

    private final NeighborhoodRepository neighborhoodRepository;
    private final UserRepository userRepository;

    /** Founds a brand-new neighborhood and places the given (unsaved) user as its first member. */
    @Transactional
    public User foundNeighborhood(User user) {
        // memberCount starts at 1, not 0: the founder immediately occupies localIndex 0, so
        // the next joiner must read memberCount=1 and get localIndex=1, not collide at 0.
        Neighborhood neighborhood = neighborhoodRepository.save(Neighborhood.builder()
                .memberCount(1L)
                .createdAt(Instant.now())
                .build());
        return placeInNeighborhood(user, neighborhood, 0L);
    }

    /**
     * Places the given (unsaved) user as the next member of an existing neighborhood.
     * Locks the neighborhood row for the duration of this transaction so two concurrent
     * registrations into the same neighborhood can't both read the same memberCount and
     * collide on localIndex.
     *
     * <p>If the sponsor's neighborhood is already at capacity, this founds a brand-new
     * neighborhood for the user instead of joining — an accepted, explicit trade-off (see
     * {@link #LOCAL_ORDER}) rather than overflowing localIndex into the neighborhood-id bits.
     * The caller's separate sponsor {@code ConnectionRequest} still links them socially even
     * though they land in different neighborhoods.
     */
    @Transactional
    public User joinNeighborhood(User user, Neighborhood sponsorNeighborhood) {
        Neighborhood locked = neighborhoodRepository.lockForUpdate(sponsorNeighborhood.getCurveIndex());
        if (locked.getMemberCount() >= NEIGHBORHOOD_CAPACITY) {
            return foundNeighborhood(user);
        }
        long localIndex = locked.getMemberCount();
        locked.setMemberCount(localIndex + 1);
        neighborhoodRepository.save(locked);
        return placeInNeighborhood(user, locked, localIndex);
    }

    /**
     * The one deliberate exception to "assign once, never revisit": when a sponsor declines
     * the initial connection request, the already-placed user is relocated to a brand-new
     * neighborhood of their own. Their old neighborhood simply keeps a permanent gap where
     * their localIndex used to be — harmless at this scale, nothing to reclaim.
     */
    @Transactional
    public User relocateToNewNeighborhood(User user) {
        Neighborhood neighborhood = neighborhoodRepository.save(Neighborhood.builder()
                .memberCount(1L)
                .createdAt(Instant.now())
                .build());
        return placeInNeighborhood(user, neighborhood, 0L);
    }

    private User placeInNeighborhood(User user, Neighborhood neighborhood, long localIndex) {
        long mapIndex = (neighborhood.getCurveIndex() << LOCAL_BITS) | localIndex;
        long[] xy = HilbertCurve.d2xy(COMBINED_ORDER, mapIndex);

        user.setNeighborhood(neighborhood);
        user.setLocalIndex(localIndex);
        user.setMapIndex(mapIndex);
        user.setMapX(xy[0]);
        user.setMapY(xy[1]);
        return userRepository.save(user);
    }
}
