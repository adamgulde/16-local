import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../services/userService';
import { initiateSignInOtp, verifySignInOtp, saveSession } from '../../services/authService';
import { getAuthErrorMessage } from '../../services/apiClient';
import { formatPhoneNumber, isCompletePhoneNumber } from '../../utils/phoneUtils';
import { useOtpCooldown } from '../../hooks/useOtpCooldown';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login = ({ onLogin }: LoginProps) => {
  const [phoneNumber, setPhoneNumber] = useState(() => localStorage.getItem('remembered_phone') || '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const submittingRef = useRef(false);
  const { cooldown, isCoolingDown, startCooldown } = useOtpCooldown(30);

  const handleInitiate = async () => {
    if (submittingRef.current) return;
    const trimmed = phoneNumber.trim();
    if (!trimmed) {
      setError('Please enter your phone number.');
      return;
    }
    if (!isCompletePhoneNumber(trimmed)) {
      setError('Please enter a valid 10-digit phone number (+1 ___-___-____).');
      return;
    }
    const resolved = formatPhoneNumber(trimmed);
    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await initiateSignInOtp(resolved);
      setPhoneNumber(resolved);
      setCode('');
      setStep('OTP');
      setResendSuccess(false);
      startCooldown(30);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to send verification code.'));
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      }, 300);
    }
  };

  const handleVerify = async () => {
    if (submittingRef.current) return;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    const resolvedPhone = formatPhoneNumber(phoneNumber.trim());
    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const auth = await verifySignInOtp(resolvedPhone, trimmedCode);
      saveSession(auth);
      localStorage.setItem('remembered_phone', resolvedPhone);
      onLogin(auth.user);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Invalid or expired code.'));
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      }, 300);
    }
  };

  const handleResend = async () => {
    if (submittingRef.current || isCoolingDown) return;
    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const resolvedPhone = formatPhoneNumber(phoneNumber.trim());
      await initiateSignInOtp(resolvedPhone);
      setResendSuccess(true);
      startCooldown(30);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Failed to resend code.'));
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      }, 300);
    }
  };

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
          {step === 'PHONE'
            ? 'Enter your phone number to receive a one-time code.'
            : "If this number can be used here, we've sent a code."}
        </p>
        {step === 'OTP' && (
          <p style={{ margin: '-8px 0 0', fontSize: '12px', color: '#8e8e93', textAlign: 'center' }}>
            No code? You may need to{' '}
            <Link to="/register" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
              sign up
            </Link>{' '}
            instead.
          </p>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={(e) => { e.preventDefault(); handleInitiate(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>
                Phone Number
              </label>
              <input
                autoFocus
                type="tel"
                placeholder="+1 ___-___-____"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
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
            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
            >
              {isSubmitting ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => { setStep('PHONE'); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '13px', padding: 0 }}
              >
                ← Change Phone
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={isSubmitting || isCoolingDown}
                style={{ background: 'none', border: 'none', color: isCoolingDown ? '#6a6a70' : '#9a9a9a', cursor: isSubmitting || isCoolingDown ? 'not-allowed' : 'pointer', fontSize: '13px', padding: 0 }}
              >
                {isSubmitting ? 'Sending...' : isCoolingDown ? `Resend in ${cooldown}s` : 'Resend Code'}
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

        <div style={{ textAlign: 'center', fontSize: '13px', color: '#9a9a9a' }}>
          <Link to="/" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
            ← View Instructions
          </Link>
        </div>
      </div>
    </div>
  );
};
