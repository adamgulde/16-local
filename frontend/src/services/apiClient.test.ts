import { describe, it, expect } from 'vitest';
import { isSafeErrorMessage, extractErrorMessage, getSafeErrorMessage } from './apiClient';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

describe('Error Sanitization & Masking', () => {
  it('identifies safe business messages', () => {
    expect(isSafeErrorMessage('Invalid verification code.')).toBe(true);
    expect(isSafeErrorMessage('Phone number is required')).toBe(true);
    expect(isSafeErrorMessage('User not found')).toBe(true);
  });

  it('rejects internal stack traces, class names, or SQL fragments', () => {
    expect(isSafeErrorMessage('NullPointerException: target is null')).toBe(false);
    expect(isSafeErrorMessage('java.lang.IllegalArgumentException: bad id')).toBe(false);
    expect(isSafeErrorMessage('org.springframework.web.HttpMediaTypeNotSupportedException')).toBe(false);
    expect(isSafeErrorMessage('at org.postgresql.Driver.connect(Driver.java:288)')).toBe(false);
    expect(isSafeErrorMessage('ERROR: duplicate key value violates unique constraint "users_phone_key" (SQL state: 23505)')).toBe(false);
  });

  it('masks 500 server errors cleanly', () => {
    const error = new AxiosError(
      'Internal Server Error',
      '500',
      {} as InternalAxiosRequestConfig,
      {},
      {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'java.lang.NullPointerException at com.example.demo.Service' },
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse
    );

    const result = getSafeErrorMessage(error, 'Default fallback');
    expect(result).toBe('A server error occurred. Please try again later.');
    expect(result).not.toContain('NullPointerException');
  });

  it('masks network connectivity errors cleanly', () => {
    const error = new AxiosError('Network Error');
    const result = getSafeErrorMessage(error);
    expect(result).toBe('Unable to connect to the server. Please check your network connection.');
  });

  it('allows safe 400 business validation messages', () => {
    const error = new AxiosError(
      'Bad Request',
      '400',
      {} as InternalAxiosRequestConfig,
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'Invalid or expired verification code' },
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse
    );

    const result = getSafeErrorMessage(error);
    expect(result).toBe('Invalid or expired verification code');
  });

  it('masks unsafe 400 messages with fallback', () => {
    const error = new AxiosError(
      'Bad Request',
      '400',
      {} as InternalAxiosRequestConfig,
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'MethodArgumentTypeMismatchException: Failed to convert value of type java.lang.String' },
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse
    );

    const result = getSafeErrorMessage(error, 'Please check your input.');
    expect(result).toBe('Please check your input.');
  });

  it('extracts safe error messages and suppresses unsafe ones via extractErrorMessage', () => {
    const safeError = new AxiosError(
      'Bad Request',
      '400',
      {} as InternalAxiosRequestConfig,
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'Invalid invite code' },
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse
    );
    expect(extractErrorMessage(safeError)).toBe('Invalid invite code');

    const unsafeError = new AxiosError(
      'Bad Request',
      '400',
      {} as InternalAxiosRequestConfig,
      {},
      {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'NullPointerException at service' },
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      } as AxiosResponse
    );
    expect(extractErrorMessage(unsafeError)).toBeUndefined();
  });
});
