import { useState } from 'react';
import { GraphContainer } from './components/GraphContainer';
import { MobileGraphView } from './components/MobileGraphView';
import { Signin } from './components/Signin';
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
    <div className="app-container">
      {currentUser ? (
        isMobile ? (
          <MobileGraphView currentUser={currentUser} onLogout={handleLogout} />
        ) : (
          <GraphContainer currentUser={currentUser} onLogout={handleLogout} />
        )
      ) : (
        <Signin onLogin={setCurrentUser} />
      )}
    </div>
  );
}

export default App
