import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import type { User } from '../services/userService';
import { useIsMobile } from '../hooks/useIsMobile';
import { DisconnectIcon, TargetIcon, ChevronLeftIcon } from './Icons';

interface NotFoundProps {
  currentUser?: User | null;
}

interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  color: string;
  label?: string;
  isTarget404?: boolean;
  isMe?: boolean;
}

interface SimLink {
  source: number;
  target: number;
  isSevered?: boolean;
}

export const NotFound = ({ currentUser }: NotFoundProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.targetX = e.touches[0].clientX;
        mouse.targetY = e.touches[0].clientY;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    // Generate constellation nodes based on viewport
    const cx = width / 2;
    const cy = height / 2;
    const spread = Math.min(width, height) * 0.38;

    const nodes: SimNode[] = [
      // 0: You (Current user node, left of center)
      {
        x: cx - spread * 0.7,
        y: cy + spread * 0.1,
        vx: 0,
        vy: 0,
        baseX: cx - spread * 0.7,
        baseY: cy + spread * 0.1,
        radius: 8,
        color: '#3d8bff',
        label: currentUser ? currentUser.firstName : 'YOU',
        isMe: true,
      },
      // 1..7: Intermediate neighborhood nodes
      {
        x: cx - spread * 0.35,
        y: cy - spread * 0.45,
        vx: 0,
        vy: 0,
        baseX: cx - spread * 0.35,
        baseY: cy - spread * 0.45,
        radius: 5,
        color: '#4caf50',
      },
      {
        x: cx - spread * 0.4,
        y: cy + spread * 0.55,
        vx: 0,
        vy: 0,
        baseX: cx - spread * 0.4,
        baseY: cy + spread * 0.55,
        radius: 5,
        color: '#4caf50',
      },
      {
        x: cx - spread * 0.1,
        y: cy - spread * 0.15,
        vx: 0,
        vy: 0,
        baseX: cx - spread * 0.1,
        baseY: cy - spread * 0.15,
        radius: 4.5,
        color: '#81c784',
      },
      {
        x: cx + spread * 0.15,
        y: cy - spread * 0.5,
        vx: 0,
        vy: 0,
        baseX: cx + spread * 0.15,
        baseY: cy - spread * 0.5,
        radius: 4,
        color: '#c8e6c9',
      },
      {
        x: cx + spread * 0.1,
        y: cy + spread * 0.4,
        vx: 0,
        vy: 0,
        baseX: cx + spread * 0.1,
        baseY: cy + spread * 0.4,
        radius: 4.5,
        color: '#81c784',
      },
      {
        x: cx + spread * 0.35,
        y: cy - spread * 0.1,
        vx: 0,
        vy: 0,
        baseX: cx + spread * 0.35,
        baseY: cy - spread * 0.1,
        radius: 4,
        color: 'rgba(255, 255, 255, 0.85)',
      },
      // 7: Severed gateway node
      {
        x: cx + spread * 0.45,
        y: cy + spread * 0.25,
        vx: 0,
        vy: 0,
        baseX: cx + spread * 0.45,
        baseY: cy + spread * 0.25,
        radius: 4.5,
        color: 'rgba(255, 255, 255, 0.85)',
      },
      // 8: The 404 Node (isolated, right of center)
      {
        x: cx + spread * 0.85,
        y: cy - spread * 0.25,
        vx: 0,
        vy: 0,
        baseX: cx + spread * 0.85,
        baseY: cy - spread * 0.25,
        radius: 8,
        color: '#ff6b6b',
        label: '404',
        isTarget404: true,
      },
    ];

    const links: SimLink[] = [
      { source: 0, target: 1 },
      { source: 0, target: 2 },
      { source: 1, target: 3 },
      { source: 2, target: 3 },
      { source: 1, target: 4 },
      { source: 2, target: 5 },
      { source: 3, target: 6 },
      { source: 5, target: 7 },
      { source: 6, target: 7 },
      // Severed links towards 404
      { source: 6, target: 8, isSevered: true },
      { source: 4, target: 8, isSevered: true },
    ];

    let t = 0;

    const render = () => {
      t += 0.02;
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Hilbert-style Coordinate Grid
      const step = 64;
      const offsetX = (mouse.x - width / 2) * 0.03;
      const offsetY = (mouse.y - height / 2) * 0.03;

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';

      ctx.beginPath();
      for (let x = (offsetX % step); x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = (offsetY % step); y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Coordinate dots
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      const dotRadius = 1.4;
      for (let x = (offsetX % step); x < width; x += step) {
        for (let y = (offsetY % step); y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // 2. Update Node Positions with gentle floating physics
      nodes.forEach((node, i) => {
        const floatOffset = Math.sin(t + i * 1.3) * 12;
        const floatOffsetX = Math.cos(t * 0.8 + i * 0.9) * 10;
        const targetX = node.baseX + floatOffsetX + (mouse.x - width / 2) * (0.02 + (i % 3) * 0.01);
        const targetY = node.baseY + floatOffset + (mouse.y - height / 2) * (0.02 + (i % 3) * 0.01);

        node.vx = (targetX - node.x) * 0.08;
        node.vy = (targetY - node.y) * 0.08;
        node.x += node.vx;
        node.y += node.vy;
      });

      // 3. Draw Links
      links.forEach((link) => {
        const s = nodes[link.source];
        const tgt = nodes[link.target];

        ctx.save();
        if (link.isSevered) {
          // Severed link: dashed line that breaks halfway
          const midX = (s.x + tgt.x) / 2;
          const midY = (s.y + tgt.y) / 2;

          ctx.strokeStyle = 'rgba(255, 107, 107, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);

          // Draw first half towards break
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(midX, midY);
          ctx.stroke();

          // Draw small "x" at break point
          ctx.strokeStyle = '#ff6b6b';
          ctx.setLineDash([]);
          const sz = 4;
          ctx.beginPath();
          ctx.moveTo(midX - sz, midY - sz);
          ctx.lineTo(midX + sz, midY + sz);
          ctx.moveTo(midX + sz, midY - sz);
          ctx.lineTo(midX - sz, midY + sz);
          ctx.stroke();
        } else {
          // Normal active network link
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
        }
        ctx.restore();
      });

      // 4. Draw Nodes
      nodes.forEach((node) => {
        ctx.save();

        if (node.isTarget404) {
          // Pulsing radar/beacon ring around 404 node
          const pulse = (Math.sin(t * 2.5) + 1) / 2;
          const pulseRadius = node.radius + 6 + pulse * 18;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 107, 107, ${0.4 * (1 - pulse)})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();

          // Glow behind 404 node
          const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, 24);
          grad.addColorStop(0, 'rgba(255, 107, 107, 0.35)');
          grad.addColorStop(1, 'rgba(255, 107, 107, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
          ctx.fill();
        } else if (node.isMe) {
          // Subtle blue beacon for current user
          const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, 20);
          grad.addColorStop(0, 'rgba(61, 139, 255, 0.35)');
          grad.addColorStop(1, 'rgba(61, 139, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Node label
        if (node.label) {
          ctx.font = '11px ui-monospace, Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = node.isTarget404 ? '#ff6b6b' : '#f0f0f0';
          ctx.fillText(node.label, node.x, node.y + node.radius + 4);
        }

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [currentUser]);

  const handleCopyPath = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const containerStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100dvh',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#121212',
    overflow: 'hidden',
    padding: isMobile ? '16px' : '24px',
    boxSizing: 'border-box',
  };

  const panelStyle: CSSProperties = {
    position: 'relative',
    zIndex: 10,
    background: 'rgba(28, 28, 30, 0.94)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid #3a3a40',
    borderRadius: '16px',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    maxWidth: '480px',
    width: '100%',
    padding: isMobile ? '24px 20px' : '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle}>
      {/* Background Interactive Topology Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Foreground Themed HUD Panel */}
      <div style={panelStyle}>
        {/* Top Status Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 107, 107, 0.12)',
              border: '1px solid rgba(255, 107, 107, 0.35)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#ff6b6b',
              fontFamily: 'var(--mono)',
              letterSpacing: '1px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#ff6b6b',
                boxShadow: '0 0 8px #ff6b6b',
                display: 'inline-block',
              }}
            />
            NODE_STATUS // 404_UNREACHABLE
          </div>

          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '11px',
              color: '#808088',
              letterSpacing: '0.5px',
            }}
          >
            GRAPH_ID: 16
          </span>
        </div>

        {/* Hero Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              width: isMobile ? '56px' : '64px',
              height: isMobile ? '56px' : '64px',
              borderRadius: '14px',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ff6b6b',
              flexShrink: 0,
            }}
          >
            <DisconnectIcon size={isMobile ? 26 : 30} color="#ff6b6b" />
          </div>

          <div>
            <div
              style={{
                fontSize: isMobile ? '46px' : '54px',
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: '-2px',
                background: 'linear-gradient(135deg, #ffffff 30%, #c084fc 75%, #ff6b6b 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: 'var(--heading)',
              }}
            >
              404
            </div>
            <h1
              style={{
                margin: '4px 0 0',
                fontSize: isMobile ? '18px' : '20px',
                fontWeight: 600,
                color: '#f5f4f8',
                letterSpacing: '-0.3px',
              }}
            >
              Coordinate Not Found
            </h1>
          </div>
        </div>

        {/* Thematic Narrative */}
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            lineHeight: '150%',
            color: '#a0a0a8',
          }}
        >
          The coordinate or path you are attempting to traverse does not exist in the 16 graph topology.
          It may have severed its connections, drifted outside the neighborhood, or never joined the network.
        </p>

        {/* Diagnostic Telemetry Readout */}
        <div
          style={{
            background: '#151518',
            border: '1px solid #2d2d33',
            borderRadius: '8px',
            padding: '12px 14px',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#808088' }}>
            <span>REQUESTED_PATH</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <code style={{ color: '#6ab0ff', background: 'transparent', padding: 0 }}>
                {location.pathname || '/'}
              </code>
              <button
                type="button"
                onClick={handleCopyPath}
                title="Copy link"
                style={{
                  background: copied ? '#2e7d32' : '#26262a',
                  border: '1px solid #3a3a40',
                  borderRadius: '4px',
                  color: '#e0e0e0',
                  fontSize: '10px',
                  padding: '1px 5px',
                  cursor: 'pointer',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#808088' }}>
            <span>SEPARATION_DEGREE</span>
            <span style={{ color: '#ff6b6b' }}>∞ (unreachable)</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#808088' }}>
            <span>TOPOLOGY_STATUS</span>
            <span style={{ color: '#c084fc' }}>ISOLATED_CLUSTER</span>
          </div>

          {currentUser && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#808088',
                borderTop: '1px solid #25252b',
                paddingTop: '6px',
                marginTop: '2px',
              }}
            >
              <span>ACTIVE_SESSION</span>
              <span style={{ color: '#4caf50' }}>
                {currentUser.firstName} {currentUser.lastName}
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {currentUser ? (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  flex: 1,
                  minWidth: '160px',
                  padding: '10px 16px',
                  background: '#2a5f9e',
                  border: '1px solid #3d8bff',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#3474be')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#2a5f9e')}
              >
                <TargetIcon size={16} />
                Return to Network
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(47, 48, 58, 0.5)',
                  border: '1px solid #3a3a40',
                  borderRadius: '8px',
                  color: '#d5d3da',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a44')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(47, 48, 58, 0.5)')}
              >
                <ChevronLeftIcon size={16} />
                Go Back
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => navigate('/login')}
                style={{
                  flex: 1,
                  minWidth: '130px',
                  padding: '10px 16px',
                  background: '#2a5f9e',
                  border: '1px solid #3d8bff',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#3474be')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#2a5f9e')}
              >
                Sign In
              </button>

              <button
                type="button"
                onClick={() => navigate('/register')}
                style={{
                  flex: 1,
                  minWidth: '130px',
                  padding: '10px 16px',
                  background: '#26262a',
                  border: '1px solid #3a3a40',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#323238')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#26262a')}
              >
                Create Account
              </button>

              <button
                type="button"
                onClick={() => navigate(-1)}
                style={{
                  padding: '10px 14px',
                  background: 'rgba(47, 48, 58, 0.5)',
                  border: '1px solid #3a3a40',
                  borderRadius: '8px',
                  color: '#d5d3da',
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                title="Go Back"
                onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a44')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(47, 48, 58, 0.5)')}
              >
                <ChevronLeftIcon size={16} />
              </button>
            </div>
          )}

          {/* Quick Navigation Footer Links */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '14px',
              fontSize: '12px',
              color: '#808088',
              marginTop: '4px',
            }}
          >
            <Link to="/" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
              Overview Map
            </Link>
            <span>•</span>
            <Link to="/login" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
              Sign In
            </Link>
            <span>•</span>
            <Link to="/register" style={{ color: '#6ab0ff', textDecoration: 'none' }}>
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
