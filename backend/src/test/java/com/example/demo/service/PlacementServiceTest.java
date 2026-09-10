package com.example.demo.service;

import com.example.demo.model.Neighborhood;
import com.example.demo.model.User;
import com.example.demo.repository.NeighborhoodRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlacementServiceTest {

    @Mock
    private NeighborhoodRepository neighborhoodRepository;
    @Mock
    private UserRepository userRepository;

    private PlacementService placementService;

    @Test
    void founderAndFirstJoinerGetDistinctLocalIndices() {
        placementService = new PlacementService(neighborhoodRepository, userRepository);

        // Regression test: foundNeighborhood used to leave memberCount at 0 even though the
        // founder already occupies localIndex 0, so the next joinNeighborhood call would read
        // memberCount=0 and collide with the founder at the same position.
        Neighborhood neighborhood = Neighborhood.builder().curveIndex(1L).memberCount(0L).build();
        when(neighborhoodRepository.save(any())).thenAnswer(inv -> {
            Neighborhood n = inv.getArgument(0);
            n.setCurveIndex(1L);
            return n;
        });
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        User founder = User.builder().build();
        User founded = placementService.foundNeighborhood(founder);

        ArgumentCaptor<Neighborhood> savedNeighborhoodCaptor = ArgumentCaptor.forClass(Neighborhood.class);
        // Capture what actually got persisted for the neighborhood at founding time.
        org.mockito.Mockito.verify(neighborhoodRepository).save(savedNeighborhoodCaptor.capture());
        Neighborhood persistedAtFounding = savedNeighborhoodCaptor.getValue();
        assertThat(persistedAtFounding.getMemberCount())
                .as("founder occupies localIndex 0, so memberCount must already reflect 1 member")
                .isEqualTo(1L);

        assertThat(founded.getLocalIndex()).isEqualTo(0L);

        // Now simulate the very next registration joining that same neighborhood: lockForUpdate
        // would return whatever memberCount actually got persisted above.
        when(neighborhoodRepository.lockForUpdate(1L)).thenReturn(neighborhood);
        neighborhood.setMemberCount(persistedAtFounding.getMemberCount());

        User joiner = User.builder().build();
        User joined = placementService.joinNeighborhood(joiner, founded.getNeighborhood());

        assertThat(joined.getLocalIndex())
                .as("the first joiner must not reuse the founder's localIndex")
                .isNotEqualTo(founded.getLocalIndex())
                .isEqualTo(1L);
        assertThat(joined.getMapIndex()).isNotEqualTo(founded.getMapIndex());
        assertThat(new long[]{joined.getMapX(), joined.getMapY()})
                .as("distinct localIndex must produce a distinct map position")
                .isNotEqualTo(new long[]{founded.getMapX(), founded.getMapY()});
    }

    @Test
    void joinNeighborhoodFoundsANewNeighborhoodOnceSponsorsIsFull() {
        placementService = new PlacementService(neighborhoodRepository, userRepository);

        // Regression test: a neighborhood at capacity (2^(2*LOCAL_ORDER) members) must not
        // let joinNeighborhood overflow localIndex into the neighborhood-id bits. Instead the
        // new user should be founded into a brand-new neighborhood of their own.
        long capacity = 1L << (2 * PlacementService.LOCAL_ORDER);
        Neighborhood fullNeighborhood = Neighborhood.builder().curveIndex(5L).memberCount(capacity).build();
        when(neighborhoodRepository.lockForUpdate(5L)).thenReturn(fullNeighborhood);

        Neighborhood freshlyFounded = Neighborhood.builder().build();
        when(neighborhoodRepository.save(any())).thenAnswer(inv -> {
            Neighborhood n = inv.getArgument(0);
            n.setCurveIndex(99L);
            return n;
        });
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        User overflowUser = User.builder().build();
        User placed = placementService.joinNeighborhood(overflowUser, fullNeighborhood);

        assertThat(placed.getNeighborhood().getCurveIndex())
                .as("a full sponsor neighborhood must not be joined")
                .isNotEqualTo(5L);
        assertThat(placed.getLocalIndex())
                .as("the overflow user founds their own neighborhood at localIndex 0")
                .isEqualTo(0L);
        // Untouched: lockForUpdate's mock never records a save() call against curveIndex 5,
        // so the only save() invocations are for the newly founded neighborhood.
        org.mockito.Mockito.verify(neighborhoodRepository, org.mockito.Mockito.never())
                .save(argThat(n -> n.getCurveIndex() != null && n.getCurveIndex() == 5L));
    }
}
