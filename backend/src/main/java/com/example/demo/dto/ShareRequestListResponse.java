package com.example.demo.dto;

import java.util.List;

public record ShareRequestListResponse(List<ShareRequestResponse> incoming, List<ShareRequestResponse> outgoing) {
}
