import apiClient from './apiClient';
import type { User } from './userService';

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterPayload {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  sponsorUsername?: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

export const register = async (payload: RegisterPayload): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/register', payload);
  return response.data;
};

export const login = async (payload: LoginPayload): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/login', payload);
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
