import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import type { User } from '../services/userService';
import { loadSessionUser } from '../services/authService';
import {
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  MailboxIcon,
  SearchIcon,
  DisconnectIcon,
  // TagIcon,
  CheckIcon,
  SlidersIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  GridIcon,
  ColumnsIcon,
  CloseIcon,
} from './Icons';

interface InstructionsProps {
  onClose?: () => void;
  isModal?: boolean;
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
  isMe?: boolean;
}

interface SimLink {
  source: number;
  target: number;
}

const SECTION_BADGES = [
  'NETWORK_TOPOLOGY // NODE_GUIDE',
  'CAMERA_CONTROLS // HUD_VIEWPORT',
  'PATHFINDING // MUTUAL_INTRODUCTIONS',
  'INVITE_LINK // AUTO_CONNECT',
  'VIEW_MODE // COLUMNS_LAYOUT',
];

export const Instructions = ({ onClose, isModal = false, currentUser = null }: InstructionsProps) => {
  const navigate = useNavigate();
  const effectiveUser = currentUser !== undefined ? currentUser : loadSessionUser();
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [copiedDemo, setCopiedDemo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Background interactive constellation canvas (similar to 404 page)
  useEffect(() => {
    if (isModal) return;
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
    window.addEventListener('mousemove', handleMouseMove);

    const cx = width / 2;
    const cy = height / 2;
    const spread = Math.min(width, height) * 0.4;

    const nodes: SimNode[] = [
      { x: cx - spread * 0.6, y: cy + spread * 0.2, vx: 0, vy: 0, baseX: cx - spread * 0.6, baseY: cy + spread * 0.2, radius: 8, color: '#3d8bff', label: 'YOU', isMe: true },
      { x: cx - spread * 0.3, y: cy - spread * 0.4, vx: 0, vy: 0, baseX: cx - spread * 0.3, baseY: cy - spread * 0.4, radius: 5.5, color: '#22c55e', label: '1°' },
      { x: cx - spread * 0.35, y: cy + spread * 0.45, vx: 0, vy: 0, baseX: cx - spread * 0.35, baseY: cy + spread * 0.45, radius: 5.5, color: '#22c55e', label: '1°' },
      { x: cx, y: cy - spread * 0.1, vx: 0, vy: 0, baseX: cx, baseY: cy - spread * 0.1, radius: 4.5, color: '#9ca3af' },
      { x: cx + spread * 0.3, y: cy - spread * 0.35, vx: 0, vy: 0, baseX: cx + spread * 0.3, baseY: cy - spread * 0.35, radius: 4.5, color: '#9ca3af' },
      { x: cx + spread * 0.25, y: cy + spread * 0.35, vx: 0, vy: 0, baseX: cx + spread * 0.25, baseY: cy + spread * 0.35, radius: 4.5, color: '#9ca3af' },
      { x: cx + spread * 0.65, y: cy, vx: 0, vy: 0, baseX: cx + spread * 0.65, baseY: cy, radius: 7, color: '#ef4444', label: 'TARGET' },
    ];

    const links: SimLink[] = [
      { source: 0, target: 1 },
      { source: 0, target: 2 },
      { source: 1, target: 3 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 3, target: 5 },
      { source: 4, target: 6 },
      { source: 5, target: 6 },
    ];

    let t = 0;
    const render = () => {
      t += 0.015;
      mouse.x += (mouse.targetX - mouse.x) * 0.04;
      mouse.y += (mouse.targetY - mouse.y) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Coordinate grid
      const step = 60;
      const offsetX = (mouse.x - width / 2) * 0.02;
      const offsetY = (mouse.y - height / 2) * 0.02;

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
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

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      for (let x = (offsetX % step); x < width; x += step) {
        for (let y = (offsetY % step); y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Update node float physics
      nodes.forEach((node, i) => {
        const floatOffset = Math.sin(t + i * 1.2) * 10;
        const floatOffsetX = Math.cos(t * 0.8 + i) * 8;
        const targetX = node.baseX + floatOffsetX + (mouse.x - width / 2) * (0.015 + (i % 2) * 0.01);
        const targetY = node.baseY + floatOffset + (mouse.y - height / 2) * (0.015 + (i % 2) * 0.01);

        node.vx = (targetX - node.x) * 0.06;
        node.vy = (targetY - node.y) * 0.06;
        node.x += node.vx;
        node.y += node.vy;
      });

      // Draw links
      links.forEach((link) => {
        const s = nodes[link.source];
        const tgt = nodes[link.target];
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
        ctx.restore();
      });

      // Draw nodes
      nodes.forEach((node) => {
        ctx.save();
        if (node.isMe) {
          const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, 18);
          grad.addColorStop(0, 'rgba(61, 139, 255, 0.4)');
          grad.addColorStop(1, 'rgba(61, 139, 255, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        if (node.label) {
          ctx.font = '10px ui-monospace, Consolas, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#c5c5c7';
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
    };
  }, [isModal]);

  // Keyboard navigation (Left / Right arrow keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'Right') {
        setCurrentStep((prev) => Math.min(prev + 1, 4));
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else if (effectiveUser) {
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate('/');
      }
    } else {
      navigate('/login');
    }
  };

  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleBack();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleDemoShare = () => {
    setCopiedDemo(true);
    setTimeout(() => setCopiedDemo(false), 2000);
  };

  // Modern HUD styling matching NotFound.tsx
  const containerStyle: CSSProperties = isModal
    ? {
        maxHeight: '82vh',
        overflowY: 'auto',
        color: '#f0f0f0',
        padding: '8px 4px',
        boxSizing: 'border-box',
      }
    : {
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        height: '100dvh',
        background: '#121212',
        color: '#f0f0f0',
        padding: '24px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      };

  const panelStyle: CSSProperties = isModal
    ? {
        width: '100%',
      }
    : {
        position: 'relative',
        zIndex: 10,
        maxWidth: '620px',
        width: '100%',
        background: 'rgba(28, 28, 30, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid #3a3a40',
        borderRadius: '16px',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        padding: '28px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      };

  const visualCardStyle: CSSProperties = {
    background: '#151518',
    border: '1px solid #2d2d33',
    borderRadius: '10px',
    padding: '14px',
    boxSizing: 'border-box',
  };

  const hudIconBoxStyle: CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid #3a3a40',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#f0f0f0',
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  };

  return (
    <div style={containerStyle}>
      {/* Background Interactive Topology Canvas (Page view) */}
      {!isModal && (
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
      )}

      {/* Foreground Themed HUD Panel */}
      <div style={panelStyle}>
        {/* Top Status Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(61, 139, 255, 0.12)',
              border: '1px solid rgba(61, 139, 255, 0.35)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#6ab0ff',
              fontFamily: 'ui-monospace, Consolas, monospace',
              letterSpacing: '1px',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#3d8bff',
                boxShadow: '0 0 8px #3d8bff',
                display: 'inline-block',
              }}
            />
            {SECTION_BADGES[currentStep]}
          </div>

          <button
            onClick={handleBack}
            style={{
              background: 'rgba(47, 48, 58, 0.5)',
              border: '1px solid #3a3a40',
              color: '#d5d3da',
              borderRadius: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.2s',
            }}
          >
            {isModal ? <><CloseIcon size={14} /> Close</> : effectiveUser ? '← Back' : 'Sign In'}
          </button>
        </div>

        {/* SECTION 1: THE NETWORK & NODES */}
        {currentStep === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Reading the Graph
              </h2>
              <p style={{ margin: '6px 0 0', color: '#a0a0a8', fontSize: '13px', lineHeight: 1.4 }}>
                Each node is a verified human account. Distance from you determines color and privacy:
              </p>
            </div>

            {/* Visual Node Showcase */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {/* You */}
              <div style={visualCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', width: 28, height: 28, borderRadius: '50%', background: 'rgba(61, 139, 255, 0.3)' }} />
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#3d8bff', zIndex: 1, boxShadow: '0 0 10px #3d8bff' }} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#6ab0ff' }}>Blue (You)</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#9a9a9a', lineHeight: 1.4 }}>
                  Your personal center. All graph distances radiate outward from you.
                </p>
              </div>

              {/* 1st Degree */}
              <div style={visualCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', width: 28, height: 28, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.3)' }} />
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#22c55e', zIndex: 1, boxShadow: '0 0 10px #22c55e' }} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#4ade80' }}>Green (1st Degree)</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#9a9a9a', lineHeight: 1.4 }}>
                  Confirmed friends. <strong style={{ color: '#fff' }}>Only 1st degree can view your phone number.</strong>
                </p>
              </div>

              {/* Extended */}
              <div style={visualCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#9ca3af' }} />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#cbd5e1' }}>Gray (Extended)</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#9a9a9a', lineHeight: 1.4 }}>
                  2nd degree and beyond. Profiles and tags are visible; phone numbers remain private.
                </p>
              </div>

              {/* Path Target */}
              <div style={visualCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ position: 'relative', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', width: 28, height: 28, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.3)' }} />
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#ef4444', zIndex: 1, boxShadow: '0 0 10px #ef4444' }} />
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: '#f87171' }}>Red (Target)</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#9a9a9a', lineHeight: 1.4 }}>
                  Selected search result or active pathfinding destination.
                </p>
              </div>
            </div>

            {/* Edge line types */}
            <div style={{ ...visualCardStyle, display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 36, height: 3, background: '#d0d0d2', borderRadius: '2px' }} />
                <span style={{ fontSize: '12px', color: '#d0d0d2' }}>Confirmed Connection</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: 36, borderTop: '2px dashed #9ca3af' }} />
                <span style={{ fontSize: '12px', color: '#d0d0d2' }}>Pending Request</span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: NAVIGATION & VIEW CONTROLS */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Canvas & View Controls
              </h2>
              <p style={{ margin: '6px 0 0', color: '#a0a0a8', fontSize: '13px', lineHeight: 1.4 }}>
                Explore freely with gestures and one-tap HUD controls:
              </p>
            </div>

            {/* Gestures Banner */}
            <div style={{ ...visualCardStyle, display: 'flex', justifyContent: 'space-around', textAlign: 'center', padding: '12px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>🖱️ Drag Canvas</span>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Pan camera in 2D space</div>
              </div>
              <div style={{ width: 1, background: '#2d2d33' }} />
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>🔍 Pinch / Scroll</span>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Zoom in & out dynamically</div>
              </div>
            </div>

            {/* Viewport Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ ...visualCardStyle, display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px' }}>
                <div style={hudIconBoxStyle}>
                  <TargetIcon size={20} color="#6ab0ff" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>Locate Me Button</div>
                  <div style={{ fontSize: '12px', color: '#808088' }}>Re-centers camera directly on your personal node.</div>
                </div>
              </div>

              <div style={{ ...visualCardStyle, display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={hudIconBoxStyle}><PlusIcon size={16} /></div>
                  <div style={hudIconBoxStyle}><MinusIcon size={16} /></div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>Zoom In / Zoom Out Buttons</div>
                  <div style={{ fontSize: '12px', color: '#808088' }}>Step zoom smoothly to read names or survey constellations.</div>
                </div>
              </div>

              <div style={{ ...visualCardStyle, display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px' }}>
                <div style={hudIconBoxStyle}>
                  <MaximizeIcon size={18} color="#c084fc" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>Global Zoom Button</div>
                  <div style={{ fontSize: '12px', color: '#808088' }}>Auto-fits the entire visible network within your screen.</div>
                </div>
              </div>

              <div style={{ ...visualCardStyle, display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={hudIconBoxStyle}><SlidersIcon size={18} color="#4ade80" /></div>
                  <div style={hudIconBoxStyle}><SearchIcon size={16} /></div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0' }}>Max Distance & Search Controls</div>
                  <div style={{ fontSize: '12px', color: '#808088' }}>Filter by hop distance (1°, 2°, All) or search members by name and tags.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: REQUESTS & PATHFINDING */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Find Path & Requests
              </h2>
              <p style={{ margin: '6px 0 0', color: '#a0a0a8', fontSize: '13px', lineHeight: 1.4 }}>
                Uncover mutual introduction chains and manage direct relationships:
              </p>
            </div>

            {/* Find Path Showcase */}
            <div style={visualCardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#6ab0ff' }}>Pathfinding</span>
                <div
                  style={{
                    background: '#1e3a5f',
                    border: '1px solid #2b5278',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Find Path
                </div>
              </div>

              {/* Path Diagram */}
              <div
                style={{
                  background: '#111114',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                  fontSize: '12px',
                  overflowX: 'auto',
                }}
              >
                <span style={{ color: '#3d8bff', fontWeight: 600 }}>[You]</span>
                <span style={{ color: '#505058' }}>──►</span>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>[1° Friend]</span>
                <span style={{ color: '#505058' }}>──►</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>[Target]</span>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#808088' }}>
                Traces the shortest sequence of mutual relationships connecting you to anyone.
              </p>
            </div>

            {/* Connection Actions Showcase */}
            <div style={visualCardStyle}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f0f0f0', marginBottom: '10px' }}>
                Connection Buttons & Mailbox
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '10px' }}>
                <div style={{ background: '#1c1c20', border: '1px solid #2d2d33', borderRadius: '6px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    type="button"
                    style={{
                      background: '#1e3a5f',
                      border: '1px solid #2b5278',
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'default',
                    }}
                  >
                    Send Connection Request
                  </button>
                  <span style={{ fontSize: '11px', color: '#808088' }}>Invite 2nd degree member</span>
                </div>

                <div style={{ background: '#1c1c20', border: '1px solid #2d2d33', borderRadius: '6px', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    type="button"
                    style={{
                      background: '#2c2c2e',
                      border: '1px solid #3a3a40',
                      color: '#9a9a9a',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'default',
                    }}
                  >
                    Request Sent
                  </button>
                  <span style={{ fontSize: '11px', color: '#808088' }}>Pending their confirmation</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111114', borderRadius: '6px', padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MailboxIcon size={18} color="#6ab0ff" />
                  <span style={{ fontSize: '12px', color: '#d0d0d2' }}>Mailbox: Accept incoming requests with <CheckIcon size={12} color="#4ade80" /></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff6b6b', fontSize: '11px' }}>
                  <DisconnectIcon size={13} /> Disconnect anytime
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: INVITING FRIENDS */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Invite Friends & Auto-Connect
              </h2>
              <p style={{ margin: '6px 0 0', color: '#a0a0a8', fontSize: '13px', lineHeight: 1.4 }}>
                Instant connection via personal invite codes:
              </p>
            </div>

            {/* Invite Code Component Mockup */}
            <div
              style={{
                ...visualCardStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#808088', fontFamily: 'ui-monospace, Consolas, monospace' }}>INVITE:</span>
                <code style={{ fontSize: '16px', color: '#6ab0ff', fontWeight: 'bold', letterSpacing: '1.5px', background: '#1c1c20', padding: '4px 10px', borderRadius: '6px', border: '1px solid #3a3a40' }}>
                  {effectiveUser?.inviteCode || '8X9K2L'}
                </code>
              </div>

              <button
                type="button"
                onClick={handleDemoShare}
                style={{
                  fontSize: '12px',
                  padding: '7px 18px',
                  background: copiedDemo ? '#2e7d32' : '#3d8bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: '0 2px 10px rgba(61, 139, 255, 0.35)',
                  transition: 'all 0.15s ease',
                }}
              >
                {copiedDemo ? '✓ Link Copied' : 'Share'}
              </button>
            </div>

            {/* Visual 3-step pipeline */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div style={{ ...visualCardStyle, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>📤</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0' }}>1. Share Link</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Copy code or send SMS</div>
              </div>

              <div style={{ ...visualCardStyle, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>📱</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0' }}>2. Friend Joins</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Phone verified sign-up</div>
              </div>

              <div style={{ ...visualCardStyle, textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: '18px', marginBottom: '4px' }}>⚡</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#4ade80' }}>3. Auto-Connected</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Instant 1st degree link</div>
              </div>
            </div>

            <div style={{ ...visualCardStyle, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11px', color: '#808088', display: 'flex', justifyContent: 'space-between' }}>
              <span>TRUST_MODEL</span>
              <span style={{ color: '#4ade80' }}>NO_BOTS // PHONE_VERIFIED</span>
            </div>
          </div>
        )}

        {/* SECTION 5: COLUMNS VIEW */}
        {currentStep === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 700,
                  letterSpacing: '-0.5px',
                  background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Columns View
              </h2>
              <p style={{ margin: '6px 0 0', color: '#a0a0a8', fontSize: '13px', lineHeight: 1.4 }}>
                Switch between 2D graph and structured hierarchical columns anytime:
              </p>
            </div>

            {/* View Switcher Pill Mockup */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  background: '#151518',
                  border: '1px solid #3a3a40',
                  borderRadius: '10px',
                  padding: '3px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 14px',
                    borderRadius: '7px',
                    color: '#808088',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <GridIcon size={14} />
                  Graph
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '6px 14px',
                    borderRadius: '7px',
                    background: '#3d8bff',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    boxShadow: '0 2px 8px rgba(61, 139, 255, 0.4)',
                  }}
                >
                  <ColumnsIcon size={14} />
                  Columns
                </div>
              </div>
            </div>

            {/* 3 Cascading Columns Diagram */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div style={{ ...visualCardStyle, padding: '10px 8px' }}>
                <div style={{ fontSize: '10px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#6ab0ff', fontWeight: 700 }}>COL 1</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', marginTop: '2px' }}>You & 1st Degree</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Your direct contacts</div>
              </div>

              <div style={{ ...visualCardStyle, padding: '10px 8px' }}>
                <div style={{ fontSize: '10px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#4ade80', fontWeight: 700 }}>COL 2</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', marginTop: '2px' }}>Selected Contact</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Their direct friends</div>
              </div>

              <div style={{ ...visualCardStyle, padding: '10px 8px' }}>
                <div style={{ fontSize: '10px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#cbd5e1', fontWeight: 700 }}>COL 3</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0', marginTop: '2px' }}>Extended Group</div>
                <div style={{ fontSize: '11px', color: '#808088', marginTop: '2px' }}>Deeper network tiers</div>
              </div>
            </div>

            {/* Launch / Explore CTAs */}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '6px' }}>
              {effectiveUser ? (
                <button
                  type="button"
                  onClick={handleBack}
                  style={{
                    background: '#2a5f9e',
                    border: '1px solid #3d8bff',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '10px 28px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(61, 139, 255, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.2s',
                  }}
                >
                  <TargetIcon size={16} />
                  Return to Network
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    style={{
                      background: '#2a5f9e',
                      border: '1px solid #3d8bff',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 22px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/register')}
                    style={{
                      background: '#26262a',
                      border: '1px solid #3a3a40',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '10px 22px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Create Account
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom consecutive step navigation with back/next arrows */}
        <div
          style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Back / Previous Arrow Button */}
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={currentStep === 0}
            style={{
              background: 'rgba(47, 48, 58, 0.5)',
              border: '1px solid #3a3a40',
              color: currentStep === 0 ? '#505058' : '#d5d3da',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: currentStep === 0 ? 0.4 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <ChevronLeftIcon size={16} />
            Back
          </button>

          {/* Dots Stepper indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {[0, 1, 2, 3, 4].map((idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to section ${idx + 1}`}
                style={{
                  width: currentStep === idx ? 22 : 7,
                  height: 7,
                  borderRadius: '4px',
                  background: currentStep === idx ? '#3d8bff' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>

          {/* Forward / Next Arrow Button */}
          <button
            type="button"
            onClick={handleNextStep}
            style={{
              background: currentStep === 4 ? '#2e7d32' : '#2a5f9e',
              border: currentStep === 4 ? '1px solid #4caf50' : '1px solid #3d8bff',
              color: '#ffffff',
              borderRadius: '8px',
              padding: '8px 18px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: currentStep === 4
                ? '0 2px 10px rgba(46, 125, 50, 0.4)'
                : '0 2px 10px rgba(61, 139, 255, 0.4)',
              transition: 'all 0.15s ease',
            }}
          >
            {currentStep === 4 ? (
              effectiveUser ? 'Finish' : "Let's Go!"
            ) : (
              <>
                Next
                <ChevronRightIcon size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
