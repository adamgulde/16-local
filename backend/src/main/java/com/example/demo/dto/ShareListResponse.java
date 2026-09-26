package com.example.demo.dto;

import java.util.List;

public record ShareListResponse(List<ShareResponse> sharedByMe, List<ShareResponse> sharedWithMe) {
}
