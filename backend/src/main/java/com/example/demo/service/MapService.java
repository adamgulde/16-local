package com.example.demo.service;

import com.example.demo.dto.MapEdge;
import com.example.demo.dto.MapNeighborhoodMarker;
import com.example.demo.dto.MapUserMarker;
import com.example.demo.dto.MapUserStub;
import com.example.demo.dto.MapViewportResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.map.HilbertCurve;
import com.example.demo.model.Connection;
import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.Neighborhood;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRepository;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.repository.NeighborhoodRepository;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Backs the static map viewport endpoint. Users are placed once (at registration, by
 * PlacementService) on a single shared Hilbert curve; this service only ever reads that
 * placement back out, range-scanning by mapIndex/curveIndex rather than loading every row.
 */
@Service
@RequiredArgsConstructor
public class MapService {

    /**
     * Following standard map-tile convention, a larger zoom value means more zoomed IN
     * (street/individual level) and a smaller value means more zoomed OUT (region level).
     * At or above this threshold the viewport returns individual user markers, stubs and
     * edges; below it, individuals are collapsed into one aggregate marker per
     * neighborhood. The exact value is arbitrary — just keep any client-side call sites
     * in sync with it.
     */
    public static final int NEIGHBORHOOD_ZOOM_THRESHOLD = 12;

    private final UserRepository userRepository;
    private final NeighborhoodRepository neighborhoodRepository;
    private final ConnectionRepository connectionRepository;
    private final ConnectionRequestRepository connectionRequestRepository;
    private final ConnectionService connectionService;

    public MapViewportResponse getViewport(long minX, long minY, long maxX, long maxY, int zoom, UUID requestingUserId) {
        if (minX > maxX || minY > maxY) {
            throw new BadRequestException("minX/minY must not be greater than maxX/maxY");
        }

        if (zoom >= NEIGHBORHOOD_ZOOM_THRESHOLD) {
            return getUserLevelViewport(minX, minY, maxX, maxY, requestingUserId);
        }
        return getNeighborhoodLevelViewport(minX, minY, maxX, maxY);
    }

    private MapViewportResponse getUserLevelViewport(long minX, long minY, long maxX, long maxY, UUID requestingUserId) {
        List<long[]> ranges = HilbertCurve.rangesForBox(PlacementService.COMBINED_ORDER, minX, minY, maxX, maxY);
        Map<UUID, User> usersInBox = fetchUsersInRanges(ranges);

        List<MapUserMarker> markers = new ArrayList<>();
        for (User user : usersInBox.values()) {
            boolean includePhoneNumber = user.getId().equals(requestingUserId)
                    || connectionService.areConnected(user.getId(), requestingUserId);
            long[] founder = founderPosition(user);
            markers.add(new MapUserMarker(
                    user.getId(),
                    user.getFirstName(),
                    user.getLastName(),
                    includePhoneNumber ? user.getPhoneNumber() : null,
                    user.getMapX(),
                    user.getMapY(),
                    user.getLocalIndex(),
                    founder[0],
                    founder[1]
            ));
        }

        Set<UUID> boxIds = usersInBox.keySet();
        List<Connection> connections = connectionRepository.findByUserAIdInOrUserBIdIn(boxIds, boxIds);
        // Pending sponsor requests are an unconfirmed, in-progress social action between two
        // specific people — only shown on the map to the requesting user themself, unlike
        // confirmed connections (which are visible to any viewer, as with the rest of the map).
        List<ConnectionRequest> pendingRequests = connectionRequestRepository.findPendingBySenderIdInOrReceiverIdIn(boxIds).stream()
                .filter(r -> r.getSender().getId().equals(requestingUserId) || r.getReceiver().getId().equals(requestingUserId))
                .toList();

        List<MapEdge> edges = new ArrayList<>();
        Set<UUID> offViewportIds = new LinkedHashSet<>();

        for (Connection connection : connections) {
            UUID sourceId = connection.getUserA().getId();
            UUID targetId = connection.getUserB().getId();
            edges.add(new MapEdge(sourceId, targetId, false));
            collectIfOffViewport(sourceId, usersInBox, offViewportIds);
            collectIfOffViewport(targetId, usersInBox, offViewportIds);
        }
        for (ConnectionRequest request : pendingRequests) {
            UUID sourceId = request.getSender().getId();
            UUID targetId = request.getReceiver().getId();
            edges.add(new MapEdge(sourceId, targetId, true));
            collectIfOffViewport(sourceId, usersInBox, offViewportIds);
            collectIfOffViewport(targetId, usersInBox, offViewportIds);
        }

        List<MapUserStub> stubs = offViewportIds.isEmpty()
                ? List.of()
                : userRepository.findAllById(offViewportIds).stream()
                        .map(u -> {
                            long[] founder = founderPosition(u);
                            return new MapUserStub(u.getId(), u.getMapX(), u.getMapY(), u.getLocalIndex(), founder[0], founder[1]);
                        })
                        .toList();

        return new MapViewportResponse(markers, stubs, List.of(), edges);
    }

    private void collectIfOffViewport(UUID userId, Map<UUID, User> usersInBox, Set<UUID> offViewportIds) {
        if (!usersInBox.containsKey(userId)) {
            offViewportIds.add(userId);
        }
    }

    private Map<UUID, User> fetchUsersInRanges(List<long[]> ranges) {
        Map<UUID, User> users = new LinkedHashMap<>();
        for (long[] range : ranges) {
            for (User user : userRepository.findByMapIndexBetween(range[0], range[1])) {
                users.put(user.getId(), user);
            }
        }
        return users;
    }

    private MapViewportResponse getNeighborhoodLevelViewport(long minX, long minY, long maxX, long maxY) {
        long scale = 1L << PlacementService.LOCAL_ORDER;
        long scaledMinX = minX / scale;
        long scaledMinY = minY / scale;
        long scaledMaxX = maxX / scale;
        long scaledMaxY = maxY / scale;

        List<long[]> ranges = HilbertCurve.rangesForBox(
                PlacementService.NEIGHBORHOOD_ORDER, scaledMinX, scaledMinY, scaledMaxX, scaledMaxY);

        Map<Long, Neighborhood> neighborhoods = new LinkedHashMap<>();
        for (long[] range : ranges) {
            for (Neighborhood neighborhood : neighborhoodRepository.findByCurveIndexBetween(range[0], range[1])) {
                neighborhoods.put(neighborhood.getCurveIndex(), neighborhood);
            }
        }

        List<MapNeighborhoodMarker> markers = neighborhoods.values().stream()
                .map(neighborhood -> {
                    long[] centroid = founderPositionForCurveIndex(neighborhood.getCurveIndex());
                    return new MapNeighborhoodMarker(
                            neighborhood.getCurveIndex(), centroid[0], centroid[1], neighborhood.getMemberCount());
                })
                .toList();

        return new MapViewportResponse(List.of(), List.of(), markers, List.of());
    }

    /** A neighborhood's founder sits at localIndex 0 — this is also exactly its aggregate centroid. */
    private long[] founderPosition(User user) {
        return founderPositionForCurveIndex(user.getNeighborhood().getCurveIndex());
    }

    private long[] founderPositionForCurveIndex(long curveIndex) {
        return HilbertCurve.founderPosition(PlacementService.NEIGHBORHOOD_ORDER, PlacementService.LOCAL_ORDER, curveIndex);
    }
}
