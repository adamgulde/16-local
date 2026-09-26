import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { User } from '../../services/userService';
import { initiateSignUpOtp, register, saveSession, validateInviteCode, verifySignUpOtp } from '../../services/authService';
import { getAuthErrorMessage } from '../../services/apiClient';
import { formatPhoneNumber, isCompletePhoneNumber } from '../../utils/phoneUtils';
import { useOtpCooldown } from '../../hooks/useOtpCooldown';

interface RegisterProps {
  onLogin: (user: User) => void;
}

type Step = 'PHONE_INVITE' | 'OTP' | 'PROFILE';

export const Register = ({ onLogin }: RegisterProps) => {
  const [searchParams] = useSearchParams();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [inviteCode, setInviteCode] = useState(() => {
    return searchParams.get('code') || searchParams.get('invite') || '';
  });
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [step, setStep] = useState<Step>('PHONE_INVITE');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const submittingRef = useRef(false);
  const { cooldown, isCoolingDown, startCooldown } = useOtpCooldown(30);

  const validateCodeNow = async (codeToValidate: string): Promise<boolean> => {
    const trimmed = codeToValidate.trim();
    if (!trimmed) {
      setInviterName(null);
      setInviteCodeError(null);
      return true;
    }
    setIsValidatingCode(true);
    try {
      const result = await validateInviteCode(trimmed);
      if (result.valid) {
        setInviterName(result.inviterName || 'Member');
        setInviteCodeError(null);
        return true;
      } else {
        setInviterName(null);
        setInviteCodeError('Invite code not found');
        return false;
      }
    } catch (err) {
      setInviterName(null);
      setInviteCodeError(getAuthErrorMessage(err, 'Could not validate invite code'));
      return false;
    } finally {
      setIsValidatingCode(false);
    }
  };

  // Validate initial invite code from URL query params once on mount
  useEffect(() => {
    const initialCode = searchParams.get('code') || searchParams.get('invite');
    if (initialCode) {
      validateCodeNow(initialCode);
    }
  }, []);

  const handleInitiateSignUp = async () => {
    if (submittingRef.current) return;
    const trimmedPhone = phoneNumber.trim();
    if (!trimmedPhone) {
      setError('Please enter your phone number.');
      return;
    }
    if (!isCompletePhoneNumber(trimmedPhone)) {
      setError('Please enter a valid 10-digit phone number (+1 ___-___-____).');
      return;
    }
    if (inviteCode.trim()) {
      const isValid = await validateCodeNow(inviteCode);
      if (!isValid) {
        setError('Please provide a valid invite code or leave it blank.');
        return;
      }
    }

    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await initiateSignUpOtp(trimmedPhone, inviteCode.trim() || undefined);
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

  const handleVerifyOtpStep = async () => {
    if (submittingRef.current) return;
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await verifySignUpOtp(phoneNumber.trim(), trimmedCode);
      setStep('PROFILE');
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Invalid or expired verification code.'));
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      }, 300);
    }
  };

  const handleCompleteRegistration = async () => {
    if (submittingRef.current) return;
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError('First and last name are required.');
      return;
    }

    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const auth = await register({
        phoneNumber: phoneNumber.trim(),
        code: code.trim(),
        firstName: trimmedFirst,
        lastName: trimmedLast,
        inviteCode: inviteCode.trim() || undefined,
      });
      saveSession(auth);
      onLogin(auth.user);
    } catch (err) {
      setError(getAuthErrorMessage(err, 'Registration failed.'));
    } finally {
      setTimeout(() => {
        submittingRef.current = false;
        setIsSubmitting(false);
      }, 300);
    }
  };

  const handleResendOtp = async () => {
    if (submittingRef.current || isCoolingDown) return;
    setError('');
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await initiateSignUpOtp(phoneNumber.trim(), inviteCode.trim() || undefined);
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
        <h2 style={{ margin: 0, textAlign: 'center', color: '#f0f0f0' }}>Sign Up</h2>

        {/* Step Indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ height: '4px', width: '32px', borderRadius: '2px', background: step === 'PHONE_INVITE' ? '#3d8bff' : '#4caf50' }} />
          <div style={{ height: '4px', width: '32px', borderRadius: '2px', background: step === 'OTP' ? '#3d8bff' : step === 'PROFILE' ? '#4caf50' : '#3a3a40' }} />
          <div style={{ height: '4px', width: '32px', borderRadius: '2px', background: step === 'PROFILE' ? '#3d8bff' : '#3a3a40' }} />
        </div>

        {/* STEP 1: Phone & Optional Invite Code */}
        {step === 'PHONE_INVITE' && (
          <form onSubmit={(e) => { e.preventDefault(); handleInitiateSignUp(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#9a9a9a', textAlign: 'center' }}>
              Create your account with your phone number.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>Phone Number</label>
              <input
                autoFocus
                type="tel"
                placeholder="+1 ___-___-____"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>
                Invite Code <span style={{ color: '#6a6a70' }}>(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV123"
                value={inviteCode}
                onChange={(e) => {
                  setInviteCode(e.target.value.toUpperCase());
                  if (inviteCodeError || inviterName) {
                    setInviteCodeError(null);
                    setInviterName(null);
                  }
                }}
                onBlur={() => {
                  if (inviteCode.trim()) {
                    validateCodeNow(inviteCode);
                  }
                }}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
              {isValidatingCode && <span style={{ fontSize: '12px', color: '#9a9a9a', marginTop: '4px', display: 'block' }}>Checking code...</span>}
              {inviterName && (
                <span style={{ fontSize: '12px', color: '#4caf50', marginTop: '4px', display: 'block', fontWeight: 'bold' }}>
                  ✓ Invited by {inviterName} (will auto-connect)
                </span>
              )}
              {inviteCodeError && (
                <span style={{ fontSize: '12px', color: '#ff6b6b', marginTop: '4px', display: 'block' }}>
                  ✕ {inviteCodeError}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold', marginTop: '4px' }}
            >
              {isSubmitting ? 'Sending Code...' : 'Continue'}
            </button>
          </form>
        )}

        {/* STEP 2: OTP Code */}
        {step === 'OTP' && (
          <form onSubmit={(e) => { e.preventDefault(); handleVerifyOtpStep(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#9a9a9a', textAlign: 'center' }}>
              If this number can be used here, we've sent a code.
            </p>
            <p style={{ margin: '-8px 0 0', fontSize: '12px', color: '#8e8e93', textAlign: 'center' }}>
              No code? You may need to{' '}
              <Link to="/login" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
                sign in
              </Link>{' '}
              instead.
            </p>

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
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => { setStep('PHONE_INVITE'); setError(''); }}
                style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '13px', padding: 0 }}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isSubmitting || isCoolingDown}
                style={{ background: 'none', border: 'none', color: isCoolingDown ? '#6a6a70' : '#9a9a9a', cursor: isSubmitting || isCoolingDown ? 'not-allowed' : 'pointer', fontSize: '13px', padding: 0 }}
              >
                {isSubmitting ? 'Sending...' : isCoolingDown ? `Resend in ${cooldown}s` : 'Resend Code'}
              </button>
            </div>
            {resendSuccess && <p style={{ color: '#4caf50', fontSize: '12px', margin: 0, textAlign: 'center' }}>New code sent!</p>}
          </form>
        )}

        {/* STEP 3: First & Last Name */}
        {step === 'PROFILE' && (
          <form onSubmit={(e) => { e.preventDefault(); handleCompleteRegistration(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#9a9a9a', textAlign: 'center' }}>
              What should people call you?
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>First Name</label>
              <input
                autoFocus
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#9a9a9a', marginBottom: '4px' }}>Last Name</label>
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                style={{ width: '100%', padding: '10px', boxSizing: 'border-box', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '15px' }}
              />
            </div>

            {inviterName && (
              <div style={{ padding: '8px 10px', background: '#193026', border: '1px solid #2e7d32', borderRadius: '6px', fontSize: '12px', color: '#a5d6a7' }}>
                🤝 You will automatically connect with <strong>{inviterName}</strong> on the graph.
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ padding: '10px', background: '#2a5f9e', color: 'white', border: 'none', borderRadius: '6px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
            >
              {isSubmitting ? 'Creating Account...' : 'Complete & Display Graph'}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => { setStep('OTP'); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: '13px', padding: 0, textAlign: 'left' }}
            >
              ← Back to Code
            </button>
          </form>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: '#3a1414', border: '1px solid #ff6b6b', borderRadius: '6px', color: '#ff6b6b', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid #3a3a40', margin: '4px 0' }} />

        <div style={{ textAlign: 'center', fontSize: '13px', color: '#9a9a9a' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
            Sign In
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
