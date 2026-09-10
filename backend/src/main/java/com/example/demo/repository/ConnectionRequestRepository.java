package com.example.demo.repository;

import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface ConnectionRequestRepository extends JpaRepository<ConnectionRequest, UUID> {
    List<ConnectionRequest> findBySenderOrReceiver(User sender, User receiver);

    /** Still-outstanding requests touching any user in the given id set on either side — used by the map viewport to find edges. */
    @Query("select cr from ConnectionRequest cr where cr.status = com.example.demo.model.ConnectionRequest.RequestStatus.PENDING "
            + "and (cr.sender.id in :ids or cr.receiver.id in :ids)")
    List<ConnectionRequest> findPendingBySenderIdInOrReceiverIdIn(@Param("ids") Collection<UUID> ids);
}
