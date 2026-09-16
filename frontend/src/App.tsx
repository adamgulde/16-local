import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GraphContainer } from './components/GraphContainer';
import { MobileGraphView } from './components/MobileGraphView';
import { MillerColumnsView } from './components/columns/MillerColumnsView';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { Instructions } from './components/Instructions';
import { NotFound } from './components/NotFound';
import type { User } from './services/userService';
import { loadSessionUser } from './services/authService';
import { useIsMobile } from './hooks/useIsMobile';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadSessionUser());
  const isMobile = useIsMobile();
  const [viewPreference, setViewPreference] = useState<'graph' | 'columns'>(() => {
    return (localStorage.getItem('preferred_view') as 'graph' | 'columns') || 'graph';
  });

  const [graphFocusUserId, setGraphFocusUserId] = useState<string | null>(null);
  const [graphFindPathTargetId, setGraphFindPathTargetId] = useState<string | null>(null);

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
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={
            currentUser ? (
              viewPreference === 'columns' ? (
                <MillerColumnsView
                  currentUser={currentUser}
                  onSwitchToGraph={handleSwitchToGraph}
                  isMobile={isMobile}
                />
              ) : isMobile ? (
                <MobileGraphView
                  currentUser={currentUser}
                  onSwitchToColumns={handleSwitchToColumns}
                  initialFocusUserId={graphFocusUserId}
                  initialFindPathTargetId={graphFindPathTargetId}
                />
              ) : (
                <GraphContainer
                  currentUser={currentUser}
                  onSwitchToColumns={handleSwitchToColumns}
                  initialFocusUserId={graphFocusUserId}
                  initialFindPathTargetId={graphFindPathTargetId}
                />
              )
            ) : (
              <Instructions currentUser={currentUser} />
            )
          } />
          <Route path="/login" element={
            currentUser ? <Navigate to="/" replace /> : <Login onLogin={setCurrentUser} />
          } />
          <Route path="/register" element={
            currentUser ? <Navigate to="/" replace /> : <Register onLogin={setCurrentUser} />
          } />
          <Route path="/instructions" element={<Instructions currentUser={currentUser} />} />
          <Route path="*" element={<NotFound currentUser={currentUser} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}


export default App
