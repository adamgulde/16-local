import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GraphContainer } from './components/GraphContainer';
import { MobileGraphView } from './components/MobileGraphView';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import type { User } from './services/userService';
import { loadSessionUser, clearSession } from './services/authService';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadSessionUser());
  const isMobile = useIsMobile();

  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={
            currentUser ? (
              isMobile ? (
                <MobileGraphView currentUser={currentUser} onLogout={handleLogout} />
              ) : (
                <GraphContainer currentUser={currentUser} onLogout={handleLogout} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="/login" element={
            currentUser ? <Navigate to="/" replace /> : <Login onLogin={setCurrentUser} />
          } />
          <Route path="/register" element={
            currentUser ? <Navigate to="/" replace /> : <Register onLogin={setCurrentUser} />
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App
