import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import type { User } from '../services/userService';
import { loadSessionUser } from '../services/authService';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  MailboxIcon,
  SearchIcon,
  DisconnectIcon,
  TagIcon,
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

interface DemoNode {
  id: string;
  name: string;
  phone: string;
  degree: number; // 0 = you, 1 = 1st, 2 = 2nd, 3 = 3rd, -1 = disconnected
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  bio: string;
  tags: string[];
  isMe?: boolean;
}

interface DemoLink {
  source: string;
  target: string;
  pending?: boolean;
}

const STEP_TITLES = [
  'Reading the Graph',
  'Navigation & View Controls',
  'Finding Paths & Requests',
  'Inviting Friends & Auto-Connect',
  'Columns View',
];

export const Instructions = ({ onClose, isModal = false, currentUser = null }: InstructionsProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const effectiveUser = currentUser !== undefined ? currentUser : loadSessionUser();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tutorial Step State (0 to 4)
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [activeView, setActiveView] = useState<'graph' | 'columns'>('graph');

  // Selected Demo Node for Profile Card (Default null so it can be opened/closed)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Interactive Demo States
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [pathMessage, setPathMessage] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());
  const [samConnected, setSamConnected] = useState<boolean>(false);
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [maxDistanceFilter, setMaxDistanceFilter] = useState<number>(Infinity);
  const [showDistanceDropdown, setShowDistanceDropdown] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  // Columns view scaling states
  const [mobileActiveColumn, setMobileActiveColumn] = useState<number>(1);
  const [columnFilter, setColumnFilter] = useState<string>('');
  const [columnSort, setColumnSort] = useState<'name-asc' | 'name-desc'>('name-asc');

  // Camera State
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 });

  // 7 Nodes Definition: Exactly 7 nodes, all connected except 1 (Sam)
  const [nodes, setNodes] = useState<DemoNode[]>(() => [
    {
      id: 'you',
      name: effectiveUser ? `${effectiveUser.firstName} ${effectiveUser.lastName}` : 'You (Current User)',
      phone: effectiveUser?.phoneNumber || '(555) 010-0001',
      degree: 0,
      color: '#3d8bff',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: -140,
      baseY: 20,
      radius: 12,
      bio: 'Exploring and expanding human connections.',
      tags: ['Engineering', 'Design'],
      isMe: true,
    },
    {
      id: 'alice',
      name: 'Alice Chen',
      phone: '(555) 012-3456',
      degree: 1,
      color: '#22c55e',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: -40,
      baseY: -80,
      radius: 9,
      bio: 'Product Designer & UX Strategist. Mutual connection.',
      tags: ['Design', 'UI/UX', 'Mobile'],
    },
    {
      id: 'bob',
      name: 'Bob Miller',
      phone: '(555) 019-8765',
      degree: 1,
      color: '#22c55e',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: -50,
      baseY: 100,
      radius: 9,
      bio: 'Cloud Architect and distributed systems builder.',
      tags: ['Engineering', 'Cloud', 'DevOps'],
    },
    {
      id: 'carol',
      name: 'Carol Davis',
      phone: '(555) 017-4321',
      degree: 2,
      color: '#9ca3af',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: 60,
      baseY: -70,
      radius: 8,
      bio: 'Community Lead & Event Organizer. Friend of Alice.',
      tags: ['Community', 'Events', 'Growth'],
    },
    {
      id: 'david',
      name: 'David Kim',
      phone: '(555) 018-9900',
      degree: 2,
      color: '#9ca3af',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: 50,
      baseY: 90,
      radius: 8,
      bio: 'Data Scientist & Machine Learning researcher. Friend of Bob.',
      tags: ['AI', 'Data', 'Python'],
    },
    {
      id: 'elena',
      name: 'Elena Rostova',
      phone: '(555) 014-7788',
      degree: 3,
      color: '#9ca3af',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: 160,
      baseY: 10,
      radius: 8.5,
      bio: 'Tech Founder & Angel Investor. Connected through Carol and David.',
      tags: ['Startups', 'Investing', 'Mentorship'],
    },
    {
      id: 'sam',
      name: 'Sam Taylor',
      phone: '(555) 016-5544',
      degree: -1,
      color: '#9ca3af',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      baseX: 40,
      baseY: 170,
      radius: 8,
      bio: 'Music Producer & Sound Designer. Not yet connected to anyone.',
      tags: ['Music', 'Audio', 'Creative'],
    },
  ]);

  // Initial links: All connected except Sam
  const [links, setLinks] = useState<DemoLink[]>([
    { source: 'you', target: 'alice' },
    { source: 'you', target: 'bob' },
    { source: 'alice', target: 'carol' },
    { source: 'bob', target: 'david' },
    { source: 'carol', target: 'elena' },
    { source: 'david', target: 'elena' },
  ]);

  // When Sam connects, turn Sam green & link directly to You with a SOLID line
  useEffect(() => {
    if (samConnected) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === 'sam' ? { ...n, degree: 1, color: '#22c55e', baseX: -60, baseY: 170 } : n
        )
      );
      setLinks((prev) => {
        const withoutPending = prev.filter(
          (l) =>
            !((l.source === 'you' && l.target === 'sam') || (l.source === 'sam' && l.target === 'you'))
        );
        return [...withoutPending, { source: 'you', target: 'sam', pending: false }];
      });
    }
  }, [samConnected]);

  // Step changes: reset active path if stepping back before step 2
  useEffect(() => {
    if (currentStep < 2) {
      setActivePath(null);
      setPathMessage(null);
    }
  }, [currentStep]);

  // Prevent entire page from pinch-zooming on mobile
  useEffect(() => {
    const handleTouchPrevent = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', handleTouchPrevent, { passive: false });
    return () => {
      document.removeEventListener('touchmove', handleTouchPrevent);
    };
  }, []);

  // Canvas Interaction & Simulation Loop
  useEffect(() => {
    if (activeView !== 'graph') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.parentElement?.clientHeight || window.innerHeight;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Mouse & Drag State
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let initialPinchDist = 0;
    let initialPinchZoom = 1;

    const getCanvasCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const rawX = clientX - rect.left;
      const rawY = clientY - rect.top;
      const cx = width / 2;
      const cy = height / 2;
      const cam = cameraRef.current;
      const worldX = (rawX - cx - cam.x) / cam.zoom;
      const worldY = (rawY - cy - cam.y) / cam.zoom;
      return { rawX, rawY, worldX, worldY };
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const { worldX, worldY } = getCanvasCoords(e.clientX, e.clientY);
      const hit = nodes.find((n) => {
        const dx = n.x - worldX;
        const dy = n.y - worldY;
        return Math.sqrt(dx * dx + dy * dy) <= n.radius + 8;
      });

      if (hit) {
        setSelectedNodeId(hit.id);
        isDragging = false;
      } else {
        setSelectedNodeId(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        cameraRef.current.targetX += dx;
        cameraRef.current.targetY += dy;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
      } else {
        const { worldX, worldY } = getCanvasCoords(e.clientX, e.clientY);
        const hit = nodes.find((n) => {
          const dx = n.x - worldX;
          const dy = n.y - worldY;
          return Math.sqrt(dx * dx + dy * dy) <= n.radius + 8;
        });
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      cameraRef.current.targetZoom = Math.min(
        Math.max(cameraRef.current.targetZoom * zoomFactor, 0.45),
        2.8
      );
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    // Touch Support (Single touch pan + 2-finger pinch zoom without zooming the page)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        isDragging = true;
        const { worldX, worldY } = getCanvasCoords(touch.clientX, touch.clientY);
        const hit = nodes.find((n) => {
          const dx = n.x - worldX;
          const dy = n.y - worldY;
          return Math.sqrt(dx * dx + dy * dy) <= n.radius + 12;
        });
        if (hit) {
          setSelectedNodeId(hit.id);
          isDragging = false;
        } else {
          setSelectedNodeId(null);
        }
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialPinchZoom = cameraRef.current.targetZoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDragging) {
        const touch = e.touches[0];
        const dx = touch.clientX - lastMouseX;
        const dy = touch.clientY - lastMouseY;
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        cameraRef.current.targetX += dx;
        cameraRef.current.targetY += dy;
      } else if (e.touches.length === 2 && initialPinchDist > 0) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialPinchDist;
        cameraRef.current.targetZoom = Math.min(
          Math.max(initialPinchZoom * factor, 0.45),
          2.8
        );
      }
    };

    const handleTouchEnd = () => {
      isDragging = false;
      initialPinchDist = 0;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    // Physics Simulation Render Loop
    let t = 0;
    const render = () => {
      t += 0.02;

      const cam = cameraRef.current;
      cam.x += (cam.targetX - cam.x) * 0.1;
      cam.y += (cam.targetY - cam.y) * 0.1;
      cam.zoom += (cam.targetZoom - cam.zoom) * 0.1;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2 + cam.x;
      const cy = height / 2 + cam.y;

      // Coordinate grid
      ctx.save();
      const step = 50 * cam.zoom;
      const startX = cx % step;
      const startY = cy % step;

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.beginPath();
      for (let x = startX; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      for (let x = startX; x < width; x += step) {
        for (let y = startY; y < height; y += step) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Update Node Positions with float physics
      nodes.forEach((node, i) => {
        const floatX = Math.cos(t * 0.8 + i * 1.1) * 6;
        const floatY = Math.sin(t + i * 1.3) * 6;
        const targetX = node.baseX + floatX;
        const targetY = node.baseY + floatY;
        node.vx = (targetX - node.x) * 0.08;
        node.vy = (targetY - node.y) * 0.08;
        node.x += node.vx;
        node.y += node.vy;
      });

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Draw Links
      links.forEach((link) => {
        const s = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!s || !tgt) return;

        const sDist = s.degree === -1 ? 99 : s.degree;
        const tgtDist = tgt.degree === -1 ? 99 : tgt.degree;
        if (
          maxDistanceFilter !== Infinity &&
          (sDist > maxDistanceFilter || tgtDist > maxDistanceFilter)
        ) {
          return;
        }

        const sx = cx + s.x * cam.zoom;
        const sy = cy + s.y * cam.zoom;
        const tx = cx + tgt.x * cam.zoom;
        const ty = cy + tgt.y * cam.zoom;

        // Path detection
        let isPathSegment = false;
        if (activePath && activePath.length >= 2) {
          for (let pi = 0; pi < activePath.length - 1; pi++) {
            const pA = activePath[pi];
            const pB = activePath[pi + 1];
            if (
              (link.source === pA && link.target === pB) ||
              (link.source === pB && link.target === pA)
            ) {
              isPathSegment = true;
              break;
            }
          }
        }

        ctx.save();
        if (isPathSegment) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3.5 * cam.zoom;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        } else if (link.pending) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.8 * cam.zoom;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 1.4 * cam.zoom;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
        ctx.restore();
      });

      // Draw Nodes
      nodes.forEach((node) => {
        const dist = node.degree === -1 ? 99 : node.degree;
        const isDimmed =
          (activePath && !activePath.includes(node.id)) ||
          (maxDistanceFilter !== Infinity && dist > maxDistanceFilter && !node.isMe);

        const nx = cx + node.x * cam.zoom;
        const ny = cy + node.y * cam.zoom;
        const r = node.radius * cam.zoom;

        const isSelected = selectedNodeId === node.id;
        const isOnPath = activePath?.includes(node.id);

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.18 : 1;

        // Outer glow halo
        if (node.isMe || isSelected || isOnPath) {
          const glowColor = isOnPath
            ? 'rgba(239, 68, 68, 0.45)'
            : node.isMe
            ? 'rgba(61, 139, 255, 0.45)'
            : 'rgba(255, 255, 255, 0.25)';
          const grad = ctx.createRadialGradient(nx, ny, r, nx, ny, r * 2.4);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(nx, ny, r * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Selected / Path Pulse Ring
        if (isSelected || isOnPath) {
          ctx.strokeStyle = isOnPath ? '#ef4444' : '#6ab0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(nx, ny, r + 4 * cam.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Main node circle
        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = isOnPath ? '#ef4444' : node.color;
        ctx.fill();

        // Node Label text
        ctx.font = `${Math.max(10 * cam.zoom, 9)}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isOnPath ? '#f87171' : isSelected ? '#ffffff' : '#b0b0b8';
        ctx.fillText(node.name.split(' ')[0], nx, ny + r + 4);

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [activeView, nodes, links, selectedNodeId, activePath, maxDistanceFilter]);

  // Actions
  const handleLocateMe = () => {
    const you = nodes.find((n) => n.id === 'you');
    if (you) {
      cameraRef.current.targetX = -you.baseX * cameraRef.current.targetZoom;
      cameraRef.current.targetY = -you.baseY * cameraRef.current.targetZoom;
      cameraRef.current.targetZoom = 1.1;
      setSelectedNodeId('you');
    }
  };

  const handleZoom = (factor: number) => {
    cameraRef.current.targetZoom = Math.min(
      Math.max(cameraRef.current.targetZoom * factor, 0.5),
      2.5
    );
  };

  const handleGlobalZoom = () => {
    cameraRef.current.targetX = 0;
    cameraRef.current.targetY = 0;
    cameraRef.current.targetZoom = 0.85;
  };

  // BFS Path finder allowing shortest path to ANY user
  const handleFindPath = (targetId: string) => {
    if (targetId === 'you') {
      setActivePath(null);
      setPathMessage(null);
      return;
    }

    // Build adjacency list over confirmed links
    const adj = new Map<string, string[]>();
    links.forEach((l) => {
      if (l.pending) return;
      if (!adj.has(l.source)) adj.set(l.source, []);
      if (!adj.has(l.target)) adj.set(l.target, []);
      adj.get(l.source)!.push(l.target);
      adj.get(l.target)!.push(l.source);
    });

    const queue: string[][] = [['you']];
    const visited = new Set<string>(['you']);
    let foundPath: string[] | null = null;

    while (queue.length > 0) {
      const p = queue.shift()!;
      const last = p[p.length - 1];
      if (last === targetId) {
        foundPath = p;
        break;
      }
      const neighbors = adj.get(last) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([...p, n]);
        }
      }
    }

    if (foundPath) {
      setActivePath(foundPath);
      const hops = foundPath.length - 1;
      const targetName = nodes.find((n) => n.id === targetId)?.name.split(' ')[0] || 'User';
      setPathMessage(`Found ${hops}-hop path to ${targetName}`);
    } else {
      setActivePath(null);
      const targetName = nodes.find((n) => n.id === targetId)?.name || 'This user';
      setPathMessage(`No path: ${targetName} has no confirmed mutual links yet`);
    }
  };

  const handleSendConnectionRequest = (targetId: string) => {
    setPendingRequests((prev) => new Set(prev).add(targetId));
    setLinks((prev) => [...prev, { source: 'you', target: targetId, pending: true }]);
  };

  const handleDisconnect = (targetId: string) => {
    // 1. Remove link between you and targetId
    setLinks((prev) =>
      prev.filter(
        (l) =>
          !((l.source === 'you' && l.target === targetId) || (l.source === targetId && l.target === 'you'))
      )
    );

    // 2. If target is Sam, reset samConnected
    if (targetId === 'sam') {
      setSamConnected(false);
    }

    // 3. Clear any active path that contained this link
    if (activePath && activePath.includes(targetId)) {
      setActivePath(null);
      setPathMessage(null);
    }

    // 4. Update node degree and color to reflect separation
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === targetId) {
          return {
            ...n,
            degree: targetId === 'sam' ? -1 : 2,
            color: '#9ca3af',
          };
        }
        return n;
      })
    );
  };

  // Example tutorial invite code: 123ABC (Does NOT auto-connect disconnected members)
  const handleDemoShare = () => {
    navigator.clipboard?.writeText?.('https://connectionsbetween.us/register?invite=123ABC');
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2200);
  };

  const handleAcceptSamNotification = () => {
    setSamConnected(true);
    setShowNotifications(false);
  };

  const handleExitTutorial = () => {
    if (onClose) {
      onClose();
    } else if (effectiveUser) {
      navigate('/');
    } else {
      navigate('/login');
    }
  };

  const handleNextStep = () => {
    if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleExitTutorial();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Only open profile card when selectedNodeId is non-null
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null;

  // Primary button style matching real app UserCard.tsx
  const primaryButtonStyle: CSSProperties = {
    background: '#2a5f9e',
    border: '1px solid #3d8bff',
    color: 'white',
    fontWeight: 'bold',
    padding: '8px 16px',
    minHeight: isMobile ? 38 : 42,
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    fontSize: isMobile ? '12px' : '13px',
  };

  const containerStyle: CSSProperties = isModal
    ? {
        position: 'relative',
        width: '100%',
        height: '80vh',
        overflow: 'hidden',
        background: '#121214',
        borderRadius: '16px',
        color: '#f0f0f0',
        touchAction: 'none',
        userSelect: 'none',
      }
    : {
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        maxHeight: '100dvh',
        overflow: 'hidden',
        background: '#121214',
        color: '#f0f0f0',
        touchAction: 'none',
        userSelect: 'none',
        overscrollBehavior: 'none',
      };

  const hudBtnStyle: CSSProperties = {
    width: isMobile ? 36 : 38,
    height: isMobile ? 36 : 38,
    borderRadius: isMobile ? '18px' : '19px',
    background: 'rgba(28, 28, 30, 0.94)',
    backdropFilter: 'blur(16px)',
    border: '1px solid #3a3a40',
    color: '#f0f0f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
    transition: 'all 0.15s ease',
  };

  // Filter and sort helper for columns
  const filterAndSort = (items: DemoNode[]) => {
    let result = items;
    if (columnFilter.trim()) {
      const q = columnFilter.toLowerCase();
      result = result.filter(
        (n) => n.name.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return [...result].sort((a, b) => {
      if (columnSort === 'name-desc') return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
  };

  const col1Nodes = filterAndSort(nodes.filter((n) => n.degree <= 1 && n.degree !== -1));
  const col2Nodes = filterAndSort(nodes.filter((n) => n.degree === 2));
  const col3Nodes = filterAndSort(nodes.filter((n) => n.degree >= 3 || n.degree === -1));

  // Render individual contact item for Columns view
  const renderColumnItem = (n: DemoNode, depth: number) => (
    <button
      key={n.id}
      type="button"
      onClick={() => {
        setSelectedNodeId(n.id);
        if (isMobile && depth < 3) {
          setMobileActiveColumn(depth + 1);
        }
      }}
      style={{
        background: selectedNodeId === n.id ? '#2a3f5f' : '#242426',
        border: `1px solid ${selectedNodeId === n.id ? '#3d8bff' : '#2d2d33'}`,
        borderRadius: '8px',
        padding: '10px 12px',
        color: '#f0f0f0',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        transition: 'background 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: n.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 'bold',
            flexShrink: 0,
          }}
        >
          {n.name[0]}
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {n.name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#808088',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {n.degree === 0
              ? 'You'
              : n.degree === 1
              ? '1st Degree'
              : n.degree === -1
              ? 'Isolated'
              : `${n.degree}nd Degree`}
            {' • '}
            {n.tags[0] || 'Member'}
          </div>
        </div>
      </div>
      <ChevronRightIcon size={14} color="#6a6a70" />
    </button>
  );

  return (
    <div style={containerStyle}>
      {/* Top Header Bar */}
      <div
        style={{
          position: 'absolute',
          top: isMobile ? 8 : 14,
          left: isMobile ? 10 : 16,
          right: isMobile ? 10 : 16,
          zIndex: 30,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Left Side: View Switcher (Unlocked in Step 5) OR Desktop Search OR Mailbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {currentStep === 4 ? (
            <div
              style={{
                background: 'rgba(28, 28, 30, 0.94)',
                backdropFilter: 'blur(16px)',
                border: '1px solid #3d8bff',
                borderRadius: '8px',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                boxShadow: '0 0 12px rgba(61, 139, 255, 0.35)',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveView('graph')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: isMobile ? '4px 8px' : '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeView === 'graph' ? '#3d8bff' : 'transparent',
                  color: activeView === 'graph' ? '#ffffff' : '#9a9a9a',
                  fontSize: isMobile ? '11px' : '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <GridIcon size={12} />
                Graph
              </button>
              <button
                type="button"
                onClick={() => setActiveView('columns')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: isMobile ? '4px 8px' : '5px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeView === 'columns' ? '#3d8bff' : 'transparent',
                  color: activeView === 'columns' ? '#ffffff' : '#9a9a9a',
                  fontSize: isMobile ? '11px' : '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ColumnsIcon size={12} />
                Columns
              </button>
            </div>
          ) : (
            currentStep >= 1 &&
            !isMobile && (
              <div
                style={{
                  background: 'rgba(28, 28, 30, 0.92)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid #3a3a40',
                  borderRadius: '8px',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <SearchIcon size={13} color="#808088" />
                <input
                  type="text"
                  placeholder="Search nodes..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    const found = nodes.find((n) =>
                      n.name.toLowerCase().includes(e.target.value.toLowerCase())
                    );
                    if (found) setSelectedNodeId(found.id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    outline: 'none',
                    width: 120,
                  }}
                />
              </div>
            )
          )}

          {/* Mailbox Notifications (Unlocked in Step 3+) */}
          {currentStep >= 2 && (
            <div style={{ position: 'relative', pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowNotifications((prev) => !prev)}
                style={{
                  position: 'relative',
                  background: showNotifications ? '#2a3f5f' : 'rgba(28, 28, 30, 0.92)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${showNotifications ? '#3d8bff' : '#3a3a40'}`,
                  borderRadius: '8px',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Connection Requests Mailbox"
              >
                <MailboxIcon size={15} color={samConnected ? '#808088' : '#6ab0ff'} />
                {!samConnected && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -3,
                      right: -3,
                      background: '#d32f2f',
                      color: 'white',
                      borderRadius: '6px',
                      width: 13,
                      height: 13,
                      fontSize: '8px',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    1
                  </span>
                )}
              </button>

              {/* Functional Notifications Popover */}
              {showNotifications && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: isMobile ? '260px' : '280px',
                    background: 'rgba(28, 28, 30, 0.98)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid #3a3a40',
                    borderRadius: '12px',
                    padding: '12px',
                    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)',
                    zIndex: 40,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f0f0' }}>Incoming Requests</span>
                    <button
                      onClick={() => setShowNotifications(false)}
                      style={{ background: 'none', border: 'none', color: '#808088', cursor: 'pointer', padding: 2 }}
                    >
                      <CloseIcon size={13} />
                    </button>
                  </div>

                  {!samConnected ? (
                    <div style={{ background: '#1c1c20', borderRadius: '8px', padding: '8px 10px', border: '1px solid #2d2d33' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0' }}>Sam Taylor</div>
                      <div style={{ fontSize: '10px', color: '#808088', marginBottom: '6px' }}>Wants to connect with you</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={handleAcceptSamNotification}
                          style={{
                            flex: 1,
                            background: '#2e7d32',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '4px',
                            padding: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckIcon size={12} /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowNotifications(false)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: 'none',
                            color: '#a0a0a5',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#808088', textAlign: 'center', padding: '8px 0' }}>
                      ✓ No pending requests
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Shrunk Sign-in / Bypass Button on Mobile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={handleExitTutorial}
            style={{
              background: '#2a5f9e',
              border: '1px solid #3d8bff',
              color: '#ffffff',
              borderRadius: '6px',
              padding: isMobile ? '4px 10px' : '6px 14px',
              cursor: 'pointer',
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 10px rgba(61, 139, 255, 0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            {isModal ? (
              <>
                <CloseIcon size={13} /> Close
              </>
            ) : effectiveUser ? (
              isMobile ? 'Exit' : 'Exit to Network'
            ) : (
              isMobile ? 'Sign In' : 'Sign In (Bypass)'
            )}
          </button>
        </div>
      </div>

      {/* Floating Active Path Toast Banner */}
      {activePath && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 44 : 56,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 28,
            background: 'rgba(28, 28, 30, 0.96)',
            backdropFilter: 'blur(16px)',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '4px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
            fontSize: isMobile ? '10px' : '11px',
            color: '#f0f0f0',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#ef4444', fontWeight: 700 }}>PATH:</span>
          <span>{activePath.map((id) => nodes.find((n) => n.id === id)?.name.split(' ')[0]).join(' → ')}</span>
          <span style={{ color: '#808088' }}>
            ({activePath.length - 1} {activePath.length - 1 === 1 ? 'hop' : 'hops'})
          </span>
          <button
            type="button"
            onClick={() => {
              setActivePath(null);
              setPathMessage(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#9a9a9a',
              cursor: 'pointer',
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Clear Path"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Path message feedback (e.g. disconnected) */}
      {!activePath && pathMessage && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 44 : 56,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 28,
            background: 'rgba(28, 28, 30, 0.96)',
            border: '1px solid #3a3a40',
            borderRadius: '8px',
            padding: '4px 10px',
            fontSize: '11px',
            color: '#ff6b6b',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{pathMessage}</span>
          <button
            type="button"
            onClick={() => setPathMessage(null)}
            style={{ background: 'none', border: 'none', color: '#808088', cursor: 'pointer', padding: 0 }}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Main View Area: Graph Canvas OR Columns View */}
      {activeView === 'graph' ? (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none',
          }}
        />
      ) : (
        /* Columns View Demo - Scaling dynamically between desktop multi-column and mobile-specific dropdowns */
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: isMobile ? '46px 12px 130px' : '58px 20px 140px',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? '8px' : '14px',
            overflowX: isMobile ? 'hidden' : 'auto',
            overflowY: isMobile ? 'auto' : 'hidden',
            background: '#121214',
            boxSizing: 'border-box',
          }}
        >
          {/* Mobile-Specific Column Selector Dropdown Header */}
          {isMobile && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(28, 28, 30, 0.95)',
                border: '1px solid #3a3a40',
                borderRadius: '10px',
                padding: '8px 10px',
                flexShrink: 0,
              }}
            >
              <select
                value={mobileActiveColumn}
                onChange={(e) => setMobileActiveColumn(Number(e.target.value))}
                style={{
                  flex: 1,
                  background: '#242426',
                  border: '1px solid #3d8bff',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  padding: '6px 8px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                aria-label="Select Column Tier"
              >
                <option value={1}>Column 1: Direct Connections (1°) [{col1Nodes.length}]</option>
                <option value={2}>Column 2: Mutual Contacts (2°) [{col2Nodes.length}]</option>
                <option value={3}>Column 3: Extended Network (3°+) [{col3Nodes.length}]</option>
              </select>
            </div>
          )}

          {/* Quick Filter & Sort controls in Columns view */}
          <div
            style={{
              display: isMobile ? 'flex' : 'none',
              gap: '6px',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: '8px', color: '#6a6a70', display: 'flex', pointerEvents: 'none' }}>
                <SearchIcon size={12} />
              </span>
              <input
                type="text"
                placeholder="Filter column..."
                value={columnFilter}
                onChange={(e) => setColumnFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 26px',
                  background: '#1c1c1e',
                  border: '1px solid #3a3a40',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '11px',
                  outline: 'none',
                }}
              />
            </div>

            <select
              value={columnSort}
              onChange={(e) => setColumnSort(e.target.value as 'name-asc' | 'name-desc')}
              style={{
                background: '#1c1c1e',
                border: '1px solid #3a3a40',
                borderRadius: '6px',
                color: '#d0d0d0',
                fontSize: '11px',
                padding: '5px 6px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </div>

          {/* Column 1: You & 1st Degree (Visible if !isMobile or mobileActiveColumn === 1) */}
          {(!isMobile || mobileActiveColumn === 1) && (
            <div
              style={{
                flex: isMobile ? '1 1 auto' : '0 0 270px',
                width: isMobile ? '100%' : '270px',
                background: 'rgba(28, 28, 30, 0.94)',
                border: '1px solid #3a3a40',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d33', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#6ab0ff', fontWeight: 700 }}>
                  COLUMN 1: DIRECT (1°)
                </span>
                <span style={{ fontSize: '11px', color: '#808088' }}>{col1Nodes.length} friends</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                {col1Nodes.map((n) => renderColumnItem(n, 1))}
              </div>
            </div>
          )}

          {/* Column 2: Mutual Contacts (2nd Degree) (Visible if !isMobile or mobileActiveColumn === 2) */}
          {(!isMobile || mobileActiveColumn === 2) && (
            <div
              style={{
                flex: isMobile ? '1 1 auto' : '0 0 270px',
                width: isMobile ? '100%' : '270px',
                background: 'rgba(28, 28, 30, 0.94)',
                border: '1px solid #3a3a40',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d33', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#4ade80', fontWeight: 700 }}>
                  COLUMN 2: MUTUAL (2°)
                </span>
                <span style={{ fontSize: '11px', color: '#808088' }}>{col2Nodes.length} friends</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                {col2Nodes.map((n) => renderColumnItem(n, 2))}
              </div>
            </div>
          )}

          {/* Column 3: Extended Network (3rd Degree & Unconnected) (Visible if !isMobile or mobileActiveColumn === 3) */}
          {(!isMobile || mobileActiveColumn === 3) && (
            <div
              style={{
                flex: isMobile ? '1 1 auto' : '0 0 270px',
                width: isMobile ? '100%' : '270px',
                background: 'rgba(28, 28, 30, 0.94)',
                border: '1px solid #3a3a40',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d33', paddingBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#cbd5e1', fontWeight: 700 }}>
                  COLUMN 3: EXTENDED (3°+)
                </span>
                <span style={{ fontSize: '11px', color: '#808088' }}>{col3Nodes.length} members</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
                {col3Nodes.map((n) => renderColumnItem(n, 3))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating HUD View Controls (Unlocked in Step 2+) */}
      {currentStep >= 1 && activeView === 'graph' && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? 120 : 130,
            right: isMobile ? 10 : 18,
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {/* Locate Me */}
          <button type="button" onClick={handleLocateMe} title="Locate Me" style={hudBtnStyle}>
            <TargetIcon size={16} color="#6ab0ff" />
          </button>

          {/* Zoom In / Out */}
          <button type="button" onClick={() => handleZoom(1.2)} title="Zoom In" style={hudBtnStyle}>
            <PlusIcon size={15} />
          </button>
          <button type="button" onClick={() => handleZoom(0.83)} title="Zoom Out" style={hudBtnStyle}>
            <MinusIcon size={15} />
          </button>

          {/* Global Zoom */}
          <button type="button" onClick={handleGlobalZoom} title="Fit Network" style={hudBtnStyle}>
            <MaximizeIcon size={15} />
          </button>

          {/* Distance Filter Toggle */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowDistanceDropdown((prev) => !prev)}
              title="Filter Distance"
              style={{
                ...hudBtnStyle,
                borderColor: maxDistanceFilter !== Infinity ? '#4ade80' : '#3a3a40',
              }}
            >
              <SlidersIcon size={15} color={maxDistanceFilter !== Infinity ? '#4ade80' : '#f0f0f0'} />
            </button>

            {showDistanceDropdown && (
              <div
                style={{
                  position: 'absolute',
                  right: isMobile ? 42 : 46,
                  bottom: 0,
                  background: 'rgba(28, 28, 30, 0.96)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid #3a3a40',
                  borderRadius: '8px',
                  padding: '5px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  width: 120,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMaxDistanceFilter(1);
                    setShowDistanceDropdown(false);
                  }}
                  style={{
                    background: maxDistanceFilter === 1 ? '#2a3f5f' : 'transparent',
                    border: 'none',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  1st Degree (1 hop)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMaxDistanceFilter(2);
                    setShowDistanceDropdown(false);
                  }}
                  style={{
                    background: maxDistanceFilter === 2 ? '#2a3f5f' : 'transparent',
                    border: 'none',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  2nd Degree (2 hops)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMaxDistanceFilter(Infinity);
                    setShowDistanceDropdown(false);
                  }}
                  style={{
                    background: maxDistanceFilter === Infinity ? '#2a3f5f' : 'transparent',
                    border: 'none',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  All Connected
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Card for Selected Node (Only open when selectedNode is non-null) */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: isMobile ? 44 : 64,
            left: isMobile ? 10 : 16,
            right: isMobile ? 10 : 'auto',
            zIndex: 25,
            width: isMobile ? 'auto' : '280px',
            maxWidth: isMobile ? '340px' : '280px',
            maxHeight: isMobile ? '45vh' : 'auto',
            overflowY: 'auto',
            background: 'rgba(28, 28, 30, 0.96)',
            backdropFilter: 'blur(20px)',
            border: '1px solid #3a3a40',
            borderRadius: '12px',
            padding: isMobile ? '12px' : '14px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            boxSizing: 'border-box',
          }}
        >
          {/* Card Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: selectedNode.color }} />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f0f0f0' }}>
                  {selectedNode.name}
                </h3>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#808088',
                  fontFamily: 'ui-monospace, Consolas, monospace',
                }}
              >
                {selectedNode.degree === 0
                  ? 'YOU'
                  : selectedNode.degree === 1
                  ? '1ST DEGREE'
                  : selectedNode.degree === -1
                  ? 'UNCONNECTED'
                  : `${selectedNode.degree}ND DEGREE`}
              </span>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#d0d0d5',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close card"
            >
              <CloseIcon size={13} />
            </button>
          </div>

          {/* Primary Action Buttons (Find Path & Connection Request) - Styled exactly as real app */}
          {currentStep >= 2 && selectedNode.id !== 'you' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => handleFindPath(selectedNode.id)}
                style={primaryButtonStyle}
              >
                Find Path
              </button>

              {selectedNode.degree !== 1 ? (
                selectedNode.id === 'sam' && !samConnected ? (
                  <button
                    type="button"
                    onClick={handleAcceptSamNotification}
                    style={{
                      ...primaryButtonStyle,
                      background: '#2e7d32',
                      borderColor: '#4caf50',
                      color: '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    Accept Request
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendConnectionRequest(selectedNode.id)}
                    disabled={pendingRequests.has(selectedNode.id)}
                    style={{
                      ...primaryButtonStyle,
                      background: pendingRequests.has(selectedNode.id) ? '#2c2c2e' : '#1e3a5f',
                      borderColor: pendingRequests.has(selectedNode.id) ? '#3a3a40' : '#2b5278',
                      color: pendingRequests.has(selectedNode.id) ? '#9a9a9a' : '#fff',
                      cursor: pendingRequests.has(selectedNode.id) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {pendingRequests.has(selectedNode.id) ? 'Request Sent' : 'Send Connection Request'}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => handleDisconnect(selectedNode.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'rgba(211, 47, 47, 0.15)',
                    border: '1px solid #d32f2f',
                    color: '#ff6b6b',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    minHeight: isMobile ? 38 : 42,
                    fontSize: isMobile ? '12px' : '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <DisconnectIcon size={12} /> Disconnect
                </button>
              )}
            </div>
          )}

          {/* Invite Code & Share Module on You (Example code 123ABC) */}
          {currentStep >= 3 && selectedNode.id === 'you' && (
            <div
              style={{
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#2c2c2e',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #3a3a40',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#9a9a9a' }}>Invite:</span>
                <code style={{ fontSize: '13px', color: '#6ab0ff', fontWeight: 'bold', letterSpacing: '1px' }}>
                  123ABC
                </code>
              </div>
              <button
                type="button"
                onClick={handleDemoShare}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  background: copiedShare ? '#2e7d32' : '#3d8bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                {copiedShare ? '✓ Copied!' : 'Share'}
              </button>
            </div>
          )}

          {/* Phone Privacy Demonstration */}
          <div
            style={{
              background: '#161619',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #2d2d33',
              fontSize: '11px',
            }}
          >
            <span style={{ color: '#808088', fontSize: '10px', display: 'block' }}>Verified Phone:</span>
            {selectedNode.degree <= 1 && selectedNode.degree !== -1 ? (
              <span style={{ color: '#4ade80', fontWeight: 600 }}>{selectedNode.phone}</span>
            ) : (
              <span style={{ color: '#ff6b6b', fontStyle: 'italic', fontSize: '10px' }}>
                Protected (1st Degree Only)
              </span>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '11px', color: '#b0b0b8', lineHeight: 1.35 }}>
            {selectedNode.bio}
          </p>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {selectedNode.tags.map((t) => (
              <span
                key={t}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '9.5px',
                  color: '#9ca3af',
                  border: '1px solid #333339',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <TagIcon size={9} color="#808088" />
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Floating Tutorial Guidance Card - Resilient layout with flexShrink so text never covers buttons */}
      <div
        style={{
          position: 'absolute',
          bottom: isMobile ? 10 : 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          width: isMobile ? 'calc(100% - 16px)' : 'calc(100% - 32px)',
          maxWidth: '500px',
          background: 'rgba(28, 28, 30, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid #3a3a40',
          borderRadius: isMobile ? '12px' : '14px',
          padding: isMobile ? '10px 14px' : '14px 18px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '6px' : '8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Step Header (flexShrink: 0) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? '13px' : '15px',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {STEP_TITLES[currentStep]}
          </h2>

          {/* Dots Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {[0, 1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                style={{
                  width: currentStep === idx ? 16 : 5,
                  height: 5,
                  borderRadius: '3px',
                  background: currentStep === idx ? '#3d8bff' : 'rgba(255, 255, 255, 0.2)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* Scrollable Text Body (Flex: 1 1 auto, never pushes or overlaps buttons) */}
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            maxHeight: isMobile ? '65px' : '85px',
          }}
        >
          {currentStep === 0 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              Tap <strong style={{ color: '#4ade80' }}>Alice (1°)</strong> to view her phone number, then tap{' '}
              <strong style={{ color: '#cbd5e1' }}>Carol (2°)</strong> to see how contact details are shielded. Notice{' '}
              <strong style={{ color: '#cbd5e1' }}>Sam</strong> is isolated with no links.
            </p>
          )}

          {currentStep === 1 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              <strong style={{ color: '#6ab0ff' }}>View Controls Unlocked!</strong> Drag canvas to pan. Use the buttons on
              the right for <strong style={{ color: '#6ab0ff' }}>Locate Me</strong>, zoom, and distance filtering.
            </p>
          )}

          {currentStep === 2 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              <strong style={{ color: '#6ab0ff' }}>Paths & Requests Unlocked!</strong> Tap any member and click{' '}
              <strong>Find Path</strong> to trace mutual introductions. Tap isolated <strong style={{ color: '#cbd5e1' }}>Sam</strong> to accept their connection request, or check the mailbox icon above!
            </p>
          )}

          {currentStep === 3 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              <strong style={{ color: '#6ab0ff' }}>Inviting Friends:</strong> Open your user card to find your unique invite code (e.g. <strong style={{ color: '#6ab0ff' }}>123ABC</strong>). Tap <strong style={{ color: '#3d8bff' }}>Share</strong> to copy your invite link. When friends register with your code, they auto-connect directly to you!
            </p>
          )}

          {currentStep === 4 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              <strong style={{ color: '#6ab0ff' }}>Columns View Unlocked!</strong> Tap{' '}
              <strong style={{ color: '#3d8bff' }}>Columns</strong> in the top switcher. On mobile, use the tier dropdown to navigate between columns without horizontal scrolling!
            </p>
          )}
        </div>

        {/* Step Navigation Buttons (flexShrink: 0, always visible and distinct) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            paddingTop: '4px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={currentStep === 0}
            style={{
              background: 'rgba(47, 48, 58, 0.5)',
              border: '1px solid #3a3a40',
              color: currentStep === 0 ? '#505058' : '#d5d3da',
              borderRadius: '6px',
              padding: isMobile ? '5px 12px' : '6px 14px',
              fontSize: isMobile ? '11px' : '12px',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              opacity: currentStep === 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeftIcon size={13} /> Back
          </button>

          <button
            type="button"
            onClick={handleNextStep}
            style={{
              background: currentStep === 4 ? '#2e7d32' : '#2a5f9e',
              border: currentStep === 4 ? '1px solid #4caf50' : '1px solid #3d8bff',
              color: '#ffffff',
              borderRadius: '6px',
              padding: isMobile ? '5px 14px' : '6px 16px',
              fontSize: isMobile ? '11px' : '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 2px 10px rgba(61, 139, 255, 0.35)',
            }}
          >
            {currentStep === 4 ? (
              effectiveUser ? 'Finish' : 'Get Started'
            ) : (
              <>
                Next <ChevronRightIcon size={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
