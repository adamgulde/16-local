import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GraphContainer } from './components/GraphContainer';
import { MobileGraphView } from './components/MobileGraphView';
import { MillerColumnsView } from './components/columns/MillerColumnsView';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import type { User } from './services/userService';
import { loadSessionUser, clearSession } from './services/authService';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadSessionUser());
  const isMobile = useIsMobile();
  const [viewPreference, setViewPreference] = useState<'graph' | 'columns'>(() => {
    return (localStorage.getItem('preferred_view') as 'graph' | 'columns') || 'graph';
  });

  const [graphFocusUserId, setGraphFocusUserId] = useState<string | null>(null);
  const [graphFindPathTargetId, setGraphFindPathTargetId] = useState<string | null>(null);

  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
  };

  const handleSwitchToColumns = () => {
    setViewPreference('columns');
    localStorage.setItem('preferred_view', 'columns');
  };

  const handleSwitchToGraph = (focusUserId?: string, findPathTargetId?: string) => {
    if (focusUserId) setGraphFocusUserId(focusUserId);
    if (findPathTargetId) setGraphFindPathTargetId(findPathTargetId);
    setViewPreference('graph');
    localStorage.setItem('preferred_view', 'graph');
  };

  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={
            currentUser ? (
              viewPreference === 'columns' ? (
                <MillerColumnsView
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onSwitchToGraph={handleSwitchToGraph}
                  isMobile={isMobile}
                />
              ) : isMobile ? (
                <MobileGraphView
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onSwitchToColumns={handleSwitchToColumns}
                  initialFocusUserId={graphFocusUserId}
                  initialFindPathTargetId={graphFindPathTargetId}
                />
              ) : (
                <GraphContainer
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onSwitchToColumns={handleSwitchToColumns}
                  initialFocusUserId={graphFocusUserId}
                  initialFindPathTargetId={graphFindPathTargetId}
                />
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
