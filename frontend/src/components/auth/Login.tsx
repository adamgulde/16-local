import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../services/userService';
import { initiateSignInOtp, verifySignInOtp, saveSession } from '../../services/authService';
import { extractErrorMessage } from '../../services/apiClient';
import { formatPhoneNumber, isCompletePhoneNumber, resolvePhoneNumberOrShortcut } from '../../utils/phoneUtils';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login = ({ onLogin }: LoginProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleInitiate = async (customPhone?: string) => {
    const raw = customPhone !== undefined ? customPhone : phoneNumber;
    const trimmed = raw.trim();
    if (!trimmed) {
      setError('Please enter your phone number or default user (0–100).');
      return;
    }
    if (!isCompletePhoneNumber(trimmed)) {
      setError('Please enter a valid 10-digit phone number (+1 ___-___-____) or default user number (0–100).');
      return;
    }
    const resolved = resolvePhoneNumberOrShortcut(trimmed);
    setError('');
    setIsSubmitting(true);
    try {
      await initiateSignInOtp(resolved);
      setPhoneNumber(resolved);
      if (resolved.startsWith('+1 555-000-')) {
        setCode('000000');
      } else {
        setCode('');
      }
      setStep('OTP');
      setResendSuccess(false);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to send verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    const resolvedPhone = resolvePhoneNumberOrShortcut(phoneNumber.trim());
    setError('');
    setIsSubmitting(true);
    try {
      const auth = await verifySignInOtp(resolvedPhone, trimmedCode);
      saveSession(auth);
      onLogin(auth.user);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Invalid or expired code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const resolvedPhone = resolvePhoneNumberOrShortcut(phoneNumber.trim());
      await initiateSignInOtp(resolvedPhone);
      if (resolvedPhone.startsWith('+1 555-000-')) {
        setCode('000000');
      }
      setResendSuccess(true);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to resend code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDefaultUserNumber = phoneNumber.startsWith('+1 555-000-');

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div style={{
        background: '#1c1c1e',
        border: '1px solid #3a3a40',
        borderRadius: '12px',
        padding: '32px',
        width: '100%',
        maxWidth: '380px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <h2 style={{ margin: 0, textAlign: 'center', color: '#f0f0f0' }}>Sign In</h2>
        <p style={{ margin: 0, fontSize: '13px', color: '#9a9a9a', textAlign: 'center' }}>
          {step === 'PHONE' ? 'Enter your phone number to receive a one-time code.' : `Enter the 6-digit code sent to ${phoneNumber}`}
        </p>

        {step === 'PHONE' ? (
          <form onSubmit={(e) => { e.preventDefault(); handleInitiate(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>
                Phone Number or User # (0–100)
              </label>
              <input
                autoFocus
                type="tel"
                placeholder="+1 ___-___-____ (e.g. 0 to 100)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
            </div>

            <div style={{ background: '#252528', padding: '10px 12px', borderRadius: '8px', border: '1px solid #3a3a40' }}>
              <div style={{ fontSize: '11px', color: '#9a9a9a', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Quick Test: Default Users (0–100)</span>
                <span style={{ color: '#4caf50', fontSize: '10px' }}>OTP: 000000</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[0, 1, 2, 5, 10, 50, 100].map((num) => {
                  const numStr = num.toString().padStart(4, '0');
                  const phoneVal = `+1 555-000-${numStr}`;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setPhoneNumber(phoneVal);
                        handleInitiate(phoneVal);
                      }}
                      style={{
                        background: '#333338',
                        border: '1px solid #4a4a52',
                        color: '#e0e0e0',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      User {num}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isSubmitting ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>Verification Code</label>
              <input
                autoFocus
                type="text"
                placeholder="6-digit code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '18px', textAlign: 'center', letterSpacing: '4px' }}
              />
            </div>
            {isDefaultUserNumber && (
              <div style={{ fontSize: '11px', color: '#4caf50', textAlign: 'center', background: '#1c2e20', padding: '6px', borderRadius: '6px', border: '1px solid #2e5c36' }}>
                Default user code <strong>000000</strong> prefilled! Click below to sign in.
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => { setStep('PHONE'); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: 'pointer', fontSize: '13px', padding: 0 }}
              >
                ← Change Phone
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={isSubmitting}
                style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', fontSize: '13px', padding: 0 }}
              >
                Resend Code
              </button>
            </div>
            {resendSuccess && <p style={{ color: '#4caf50', fontSize: '12px', margin: 0, textAlign: 'center' }}>New code sent!</p>}
          </form>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: '#3a1414', border: '1px solid #ff6b6b', borderRadius: '6px', color: '#ff6b6b', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #3a3a40', margin: '4px 0' }} />

        <div style={{ textAlign: 'center', fontSize: '13px', color: '#9a9a9a' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
};
