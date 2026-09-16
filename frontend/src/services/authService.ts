import apiClient from './apiClient';
import type { User } from './userService';

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SignUpPayload {
  phoneNumber: string;
  code: string;
  firstName: string;
  lastName: string;
  inviteCode?: string;
}

export interface InviteCodeValidation {
  valid: boolean;
  inviterName?: string;
}

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

export const initiateSignInOtp = async (phoneNumber: string): Promise<void> => {
  await apiClient.post('/api/auth/send-otp-supabase', { phoneNumber });
};

export const verifySignInOtp = async (phoneNumber: string, code: string): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/verify-otp-supabase', { phoneNumber, code });
  return response.data;
};

export const initiateSignUpOtp = async (phoneNumber: string, inviteCode?: string): Promise<void> => {
  await apiClient.post('/api/auth/signup/send-otp-supabase', { phoneNumber, inviteCode: inviteCode || null });
};

export const verifySignUpOtp = async (phoneNumber: string, code: string): Promise<void> => {
  await apiClient.post('/api/auth/signup/verify-otp-supabase', { phoneNumber, code });
};

export const register = async (payload: SignUpPayload): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/register', payload);
  return response.data;
};

export const validateInviteCode = async (code: string): Promise<InviteCodeValidation> => {
  const response = await apiClient.get<InviteCodeValidation>(`/api/auth/validate-invite?code=${encodeURIComponent(code)}`);
  return response.data;
};

// Aliases for compatibility
export const initiateOtp = initiateSignInOtp;
export const verifyOtp = verifySignInOtp;

// Standalone Twilio Verify OTP API
export interface OtpActionResponse {
  success: boolean;
  message: string;
}

export interface OtpVerifyResponse {
  success: boolean;
  verified: boolean;
  message: string;
}

export const sendMobileOtp = async (phone: string, userId?: string): Promise<OtpActionResponse> => {
  const response = await apiClient.post<OtpActionResponse>('/api/otp/send', { phone, userId });
  return response.data;
};

export const verifyMobileOtp = async (userId: string, otp: string): Promise<OtpVerifyResponse> => {
  const response = await apiClient.post<OtpVerifyResponse>('/api/otp/verify', { userId, otp });
  return response.data;
};

export const saveSession = (auth: AuthResponse): void => {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
};

export const clearSession = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const loadSessionUser = (): User | null => {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || !rawUser) return null;
  try {
    return JSON.parse(rawUser) as User;
  } catch {
    return null;
  }
};
