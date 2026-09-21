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

import { ErrorBoundary } from './components/ErrorBoundary';

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

  const graphErrorFallback = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        background: '#121214',
        color: '#f0f0f0',
        padding: '24px',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          padding: '24px 20px',
          background: '#1c1c1e',
          borderRadius: '12px',
          border: '1px solid #3a3a40',
        }}
      >
        <div style={{ fontSize: '28px', marginBottom: '12px' }}>📊</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#ffffff' }}>Graph view unavailable</h2>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#9a9a9a', lineHeight: 1.5 }}>
          The interactive graph encountered a display issue. You can switch to the column view or reload.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={handleSwitchToColumns}
            style={{
              padding: '8px 16px',
              background: '#1e3a5f',
              border: '1px solid #2b5278',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Switch to Columns
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              background: '#2c2c2e',
              border: '1px solid #3a3a40',
              borderRadius: '6px',
              color: '#f0f0f0',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={
            currentUser ? (
              viewPreference === 'columns' ? (
                <ErrorBoundary>
                  <MillerColumnsView
                    currentUser={currentUser}
                    onSwitchToGraph={handleSwitchToGraph}
                    isMobile={isMobile}
                  />
                </ErrorBoundary>
              ) : isMobile ? (
                <ErrorBoundary fallback={graphErrorFallback}>
                  <MobileGraphView
                    currentUser={currentUser}
                    onSwitchToColumns={handleSwitchToColumns}
                    initialFocusUserId={graphFocusUserId}
                    initialFindPathTargetId={graphFindPathTargetId}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary fallback={graphErrorFallback}>
                  <GraphContainer
                    currentUser={currentUser}
                    onSwitchToColumns={handleSwitchToColumns}
                    initialFocusUserId={graphFocusUserId}
                    initialFindPathTargetId={graphFindPathTargetId}
                  />
                </ErrorBoundary>
              )
            ) : (
              <Navigate to="/instructions" replace />
            )
          } />
          <Route path="/login" element={
            currentUser ? <Navigate to="/" replace /> : (
              <ErrorBoundary>
                <Login onLogin={setCurrentUser} />
              </ErrorBoundary>
            )
          } />
          <Route path="/register" element={
            currentUser ? <Navigate to="/" replace /> : (
              <ErrorBoundary>
                <Register onLogin={setCurrentUser} />
              </ErrorBoundary>
            )
          } />
          <Route path="/instructions" element={
            <ErrorBoundary>
              <Instructions currentUser={currentUser} />
            </ErrorBoundary>
          } />
          <Route path="*" element={
            <ErrorBoundary>
              <NotFound currentUser={currentUser} />
            </ErrorBoundary>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}


export default App
