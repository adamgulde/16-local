import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { User } from '../../services/userService';
import { login, saveSession } from '../../services/authService';
import { extractErrorMessage } from '../../services/apiClient';

interface LoginProps {
  onLogin: (user: User) => void;
}

export const Login = ({ onLogin }: LoginProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const auth = await login({ username, password });
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
      <h2>Login</h2>
      <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

      <div style={{ display: 'flex', gap: '10px' }}>
        <button disabled={isSubmitting} onClick={handleLogin}>{isSubmitting ? 'Signing in...' : 'Login'}</button>
        <Link to="/register">
          <button>Go to Register</button>
        </Link>
      </div>
      {error && <p style={{ color: '#ff6b6b' }}>{error}</p>}
    </div>
  );
};
