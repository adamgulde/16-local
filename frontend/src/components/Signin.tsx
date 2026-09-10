import { useState } from 'react';
import type { User } from '../services/userService';
import { register, login, saveSession } from '../services/authService';
import { extractErrorMessage } from '../services/apiClient';

interface SigninProps {
  onLogin: (user: User) => void;
}

type RegistrationMode = 'undecided' | 'invited' | 'own';

export const Signin = ({ onLogin }: SigninProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sponsorUsername, setSponsorUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('undecided');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAuth = async (isRegister: boolean) => {
    setError('');
    setIsSubmitting(true);
    try {
      const auth = isRegister
        ? await register({
            username,
            password,
            firstName,
            lastName,
            phoneNumber,
            sponsorUsername: registrationMode === 'invited' ? sponsorUsername : undefined,
          })
        : await login({ username, password });
      saveSession(auth);
      onLogin(auth.user);
    } catch (err) {
      setError(extractErrorMessage(err) || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startRegistering = () => {
    setIsRegistering(true);
    setRegistrationMode('undecided');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '10px' }}>
      <h2>Sign In / Register</h2>
      <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

      {isRegistering && registrationMode === 'undecided' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <p>Were you invited by another user?</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setRegistrationMode('invited')}>Yes, I was invited</button>
            <button onClick={() => setRegistrationMode('own')}>No, I'm building my own network</button>
          </div>
        </div>
      )}

      {isRegistering && registrationMode !== 'undecided' && (
          <>
            <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <input type="text" placeholder="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            {registrationMode === 'invited' && (
              <input type="text" placeholder="Sponsor's Username" value={sponsorUsername} onChange={(e) => setSponsorUsername(e.target.value)} />
            )}
          </>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          disabled={isSubmitting || (isRegistering && registrationMode === 'undecided')}
          onClick={() => isRegistering ? handleAuth(true) : startRegistering()}
        >
            {isRegistering ? (isSubmitting ? 'Registering...' : 'Register') : 'Go to Register'}
        </button>
        {!isRegistering && <button disabled={isSubmitting} onClick={() => handleAuth(false)}>{isSubmitting ? 'Signing in...' : 'Login'}</button>}
      </div>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
};
