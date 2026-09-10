export const RequestStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED'
} as const;

export type RequestStatus = typeof RequestStatus[keyof typeof RequestStatus];

// Deliberately not the full User shape — a notification row never carries phone number or
// relationships, regardless of connection status (see backend UserSummary).
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ConnectionRequest {
  id: string;
  sender: UserSummary;
  receiver: UserSummary;
  status: RequestStatus;
}
