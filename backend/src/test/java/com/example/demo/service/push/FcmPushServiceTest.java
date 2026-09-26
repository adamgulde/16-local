package com.example.demo.service.push;

import com.example.demo.model.User;
import com.example.demo.model.UserDeviceToken;
import com.example.demo.repository.UserDeviceTokenRepository;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.SendResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Constructor;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.google.firebase.messaging.FirebaseMessaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FcmPushServiceTest {

    @Mock
    private UserDeviceTokenRepository userDeviceTokenRepository;
    @Mock
    private FirebaseMessaging firebaseMessaging;

    private final UUID userId = UUID.randomUUID();

    private FcmPushService newService(boolean configured, FirebaseMessaging messaging) throws Exception {
        Constructor<FcmPushService> ctor = FcmPushService.class.getDeclaredConstructor(
                UserDeviceTokenRepository.class, FirebaseMessaging.class, boolean.class);
        ctor.setAccessible(true);
        return ctor.newInstance(userDeviceTokenRepository, messaging, configured);
    }

    @Test
    void sendToUser_notConfigured_returnsZeroAndSkipsFirebase() throws Exception {
        FcmPushService service = newService(false, firebaseMessaging);

        int delivered = service.sendToUser(userId, "title", "body", Map.of());

        assertThat(delivered).isZero();
        verifyNoInteractions(firebaseMessaging);
        verifyNoInteractions(userDeviceTokenRepository);
    }

    @Test
    void sendToUser_unregisteredToken_purgesOnlyThatToken() throws Exception {
        UserDeviceToken good = UserDeviceToken.builder().deviceToken("good-token").platform("ios").build();
        UserDeviceToken stale = UserDeviceToken.builder().deviceToken("stale-token").platform("android").build();
        when(userDeviceTokenRepository.findByUser_Id(userId)).thenReturn(List.of(good, stale));

        SendResponse successResponse = mock(SendResponse.class);
        when(successResponse.isSuccessful()).thenReturn(true);

        SendResponse failureResponse = mock(SendResponse.class);
        when(failureResponse.isSuccessful()).thenReturn(false);
        FirebaseMessagingException exception = mock(FirebaseMessagingException.class);
        when(exception.getMessagingErrorCode()).thenReturn(MessagingErrorCode.UNREGISTERED);
        when(failureResponse.getException()).thenReturn(exception);

        BatchResponse batchResponse = mock(BatchResponse.class);
        when(batchResponse.getResponses()).thenReturn(List.of(successResponse, failureResponse));
        when(batchResponse.getSuccessCount()).thenReturn(1);
        when(firebaseMessaging.sendEach(anyList())).thenReturn(batchResponse);

        FcmPushService service = newService(true, firebaseMessaging);

        int delivered = service.sendToUser(userId, "title", "body", Map.of("k", "v"));

        assertThat(delivered).isEqualTo(1);
        verify(userDeviceTokenRepository).deleteByDeviceTokenIn(List.of("stale-token"));
    }

    @Test
    void sendToUser_batchException_returnsZeroWithoutThrowing() throws Exception {
        UserDeviceToken token = UserDeviceToken.builder().deviceToken("some-token").platform("ios").build();
        when(userDeviceTokenRepository.findByUser_Id(userId)).thenReturn(List.of(token));
        when(firebaseMessaging.sendEach(anyList())).thenThrow(mock(FirebaseMessagingException.class));

        FcmPushService service = newService(true, firebaseMessaging);

        int delivered = service.sendToUser(userId, "title", "body", Map.of());

        assertThat(delivered).isZero();
        verify(userDeviceTokenRepository, never()).deleteByDeviceTokenIn(anyCollection());
    }
}
