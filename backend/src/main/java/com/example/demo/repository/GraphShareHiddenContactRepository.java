package com.example.demo.repository;

import com.example.demo.model.GraphShareHiddenContact;
import com.example.demo.model.GraphShareHiddenContactId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GraphShareHiddenContactRepository extends JpaRepository<GraphShareHiddenContact, GraphShareHiddenContactId> {

    /** Every contact id the sharer has hidden from one share — read at graph-composition time. */
    List<GraphShareHiddenContact> findById_ShareId(UUID shareId);

    /** PUT /api/shares/{id}/hidden-contacts replaces the full set: clear, then re-insert. */
    void deleteById_ShareId(UUID shareId);
}
