import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { User } from '../../services/userService';
import { register, saveSession } from '../../services/authService';
import { extractErrorMessage } from '../../services/apiClient';

interface RegisterProps {
  onLogin: (user: User) => void;
}

type RegistrationMode = 'undecided' | 'invited' | 'own';

export const Register = ({ onLogin }: RegisterProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sponsorUsername, setSponsorUsername] = useState('');
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>('undecided');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const auth = await register({
        username,
        password,
        firstName,
        lastName,
        phoneNumber,
        sponsorUsername: registrationMode === 'invited' ? sponsorUsername : undefined,
      });
      saveSession(auth);
      onLogin(auth.user);
    } catch (err) {
      setError(extractErrorMessage(err) || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '10px' }}>
      <h2>Register</h2>
      
      {registrationMode === 'undecided' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <p>Were you invited by another user?</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setRegistrationMode('invited')}>Yes, I was invited</button>
            <button onClick={() => setRegistrationMode('own')}>No, I'm building my own network</button>
          </div>
          <button onClick={() => navigate('/login')}>Back</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <input type="text" placeholder="Phone Number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
          {registrationMode === 'invited' && (
            <input type="text" placeholder="Sponsor's Username" value={sponsorUsername} onChange={(e) => setSponsorUsername(e.target.value)} />
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setRegistrationMode('undecided')}>Back</button>
            <button disabled={isSubmitting} onClick={handleRegister}>{isSubmitting ? 'Registering...' : 'Register'}</button>
          </div>
        </div>
      )}
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
};
