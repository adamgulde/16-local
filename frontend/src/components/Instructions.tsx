import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import type { User } from '../services/userService';

interface InstructionsProps {
  onClose?: () => void;
  isModal?: boolean;
  currentUser?: User | null;
}

export const Instructions = ({ onClose, isModal = false, currentUser = null }: InstructionsProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  };

  const containerStyle: CSSProperties = isModal
    ? {
        maxHeight: '75vh',
        overflowY: 'auto',
        color: '#f0f0f0',
        padding: '8px 4px',
      }
    : {
        minHeight: '100vh',
        background: '#121214',
        color: '#f0f0f0',
        padding: '32px 20px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      };

  const contentBoxStyle: CSSProperties = isModal
    ? {}
    : {
        maxWidth: '720px',
        width: '100%',
        background: '#1c1c1e',
        border: '1px solid #3a3a40',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
      };

  const cardStyle: CSSProperties = {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '16px',
  };

  const badgeStyle = (color: string): CSSProperties => ({
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: color,
    marginRight: '8px',
  });

  return (
    <div style={containerStyle}>
      <div style={contentBoxStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isModal ? '20px' : '26px', fontWeight: 700, color: '#f0f0f0' }}>
              How ConnectionsBetween.US Works
            </h1>
            <p style={{ margin: '4px 0 0', color: '#9a9a9a', fontSize: '14px' }}>
              Mapping real human connections, mutual friends, and separation degrees.
            </p>
          </div>
          <button
            onClick={handleBack}
            style={{
              background: '#2c2c2e',
              border: '1px solid #3a3a40',
              color: '#f0f0f0',
              borderRadius: '8px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {isModal ? 'Close' : '← Back'}
          </button>
        </div>

        {/* 1. The Network & Node Colors */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#6ab0ff' }}>1. Reading the Graph</h3>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#c5c5c7', lineHeight: 1.5 }}>
            Every node in the network represents a verified member. Colors indicate proximity to you:
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#d0d0d2', lineHeight: 1.8 }}>
            <li>
              <span style={badgeStyle('#3d8bff')} />
              <strong style={{ color: '#6ab0ff' }}>Blue:</strong> You (your personal node in the network).
            </li>
            <li>
              <span style={badgeStyle('#22c55e')} />
              <strong style={{ color: '#4ade80' }}>Green:</strong> 1st Degree Connections — direct mutual relationships you have confirmed.
            </li>
            <li>
              <span style={badgeStyle('#9ca3af')} />
              <strong style={{ color: '#cbd5e1' }}>Gray:</strong> Extended Network — friends of friends (2nd degree) and the wider community.
            </li>
          </ul>
        </div>

        {/* 2. Navigation & View Controls */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#6ab0ff' }}>2. Navigating the 2D View</h3>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#d0d0d2', lineHeight: 1.8 }}>
            <li><strong>Pan & Zoom:</strong> Drag the canvas to pan. Scroll or pinch to zoom in and out.</li>
            <li><strong>Locate Me:</strong> Click the crosshair/compass icon at the bottom right to center and zoom in on your own node.</li>
            <li><strong>Max Distance Slider:</strong> Filter the visible graph by degrees of separation (e.g. 1 hop for direct friends, 2 hops for friends-of-friends, or All).</li>
            <li><strong>Search:</strong> Use the search bar in the top navigation to quickly jump to any member or filter by tags.</li>
          </ul>
        </div>

        {/* 3. Finding Paths */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#6ab0ff' }}>3. Finding Shortest Paths</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#c5c5c7', lineHeight: 1.5 }}>
            Curious how you connect to someone in the network? Click any person's node to open their card and click <strong>Find Path</strong>. The application will trace and highlight the shortest sequence of mutual connections between you and that person.
          </p>
        </div>

        {/* 4. Inviting Friends & Expanding Network */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#6ab0ff' }}>4. Inviting Friends</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#c5c5c7', lineHeight: 1.5 }}>
            Open your own user card (click on yourself or your name) to view your unique <strong>Invite Code</strong>. Click <strong>Share</strong> to send a personalized link. When your friends sign up through your invite link, they will automatically be connected with you in the graph!
          </p>
        </div>

        {/* 5. Miller Column View */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#6ab0ff' }}>5. Miller Columns View</h3>
          <p style={{ margin: 0, fontSize: '13px', color: '#c5c5c7', lineHeight: 1.5 }}>
            Prefer a structured hierarchy? Click the <strong>Columns</strong> toggle in the top bar to switch into a macOS Finder-style Miller columns view, where you can navigate connection chains column by column.
          </p>
        </div>

        {!isModal && !currentUser && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '32px' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: '#3d8bff',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(61, 139, 255, 0.3)',
              }}
            >
              Let's Go!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
