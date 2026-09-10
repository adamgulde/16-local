import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../services/userService';
import { initiateOtp, verifyOtp, saveSession } from '../../services/authService';
import { extractErrorMessage } from '../../services/apiClient';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login = ({ onLogin }: LoginProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInitiate = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await initiateOtp(phoneNumber);
      setStep('OTP');
    } catch (err) {
      setError(extractErrorMessage(err) || 'Failed to send code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const auth = await verifyOtp(phoneNumber, code);
      saveSession(auth);
      onLogin(auth.user);
    } catch (err) {
      setError(extractErrorMessage(err) || 'Invalid code');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '10px' }}>
      <h2>Login</h2>
      {step === 'PHONE' ? (
        <>
          <input type="text" placeholder="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          <button disabled={isSubmitting} onClick={handleInitiate}>{isSubmitting ? 'Sending...' : 'Send Code'}</button>
        </>
      ) : (
        <>
          <input type="text" placeholder="Verification Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button disabled={isSubmitting} onClick={handleVerify}>{isSubmitting ? 'Verifying...' : 'Verify'}</button>
        </>
      )}

      <Link to="/register">
        <button>Go to Register</button>
      </Link>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
};
