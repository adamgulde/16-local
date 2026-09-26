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
  TagIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  GridIcon,
  ColumnsIcon,
  CloseIcon,
  LockIcon,
} from './Icons';

interface InstructionsProps {
  onClose?: () => void;
  isModal?: boolean;
  currentUser?: User | null;
}

// The demo's own tiny stand-in for `GraphNode` (PLAN.md §3) — just what the tutorial's canvas and
// cards need to draw. `kind` drives the same visual language as the real graph (rendering.ts):
// SELF solid+glow, PLACEHOLDER dashed outline (no account), REGISTERED solid, HIDDEN grey with no
// identity revealed. `viaName` marks a node that only exists in your view because someone else
// shared their graph with you; `locked` marks a REGISTERED third party whose own account hasn't
// opted in to `discoverableInSharedGraphs` — always Hidden User, never revealable by the sharer.
type DemoKind = 'SELF' | 'PLACEHOLDER' | 'REGISTERED' | 'HIDDEN';

interface DemoNode {
  id: string;
  name: string;
  kind: DemoKind;
  phone: string | null;
  bio: string;
  tags: string[];
  note: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radius: number;
  viaName?: string | null;
  locked?: boolean;
}

interface DemoLink {
  source: string;
  target: string;
  viaShare?: boolean;
}

const STEP_TITLES = [
  'Your Private Graph',
  'Tags & Notes',
  'Share Requests',
  'Share Mode & Hidden Users',
  "Other's Graphs & Search",
];

const styleForKind = (n: DemoNode): { fill: string; dashed: boolean; label: string } => {
  if (n.kind === 'HIDDEN') return { fill: '#5b6472', dashed: true, label: 'Hidden User' };
  if (n.kind === 'PLACEHOLDER') return { fill: '#9ca3af', dashed: true, label: n.name.split(' ')[0] };
  if (n.kind === 'REGISTERED') return { fill: '#22c55e', dashed: false, label: n.name.split(' ')[0] };
  return { fill: '#3d8bff', dashed: false, label: n.name.split(' ')[0] };
};

const kindBadge = (n: DemoNode): string => {
  if (n.kind === 'HIDDEN') return 'HIDDEN';
  if (n.kind === 'SELF') return 'YOU';
  return n.kind;
};

export const Instructions = ({ onClose, isModal = false, currentUser = null }: InstructionsProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const effectiveUser = currentUser !== undefined ? currentUser : loadSessionUser();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tutorial step state (0..4 — see STEP_TITLES).
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [activeView, setActiveView] = useState<'graph' | 'columns'>('graph');

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [pathMessage, setPathMessage] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Step 1 — tags & notes ("your notepad") demo, applied to whichever contact is selected.
  const [demoTagsByNode, setDemoTagsByNode] = useState<Record<string, string[]>>({});
  const [noteRevealed, setNoteRevealed] = useState<Record<string, boolean>>({});

  // Step 2 — Priya's incoming share request: two independent choices (PLAN.md §1.3).
  const [priyaRequestConnect, setPriyaRequestConnect] = useState(false);
  const [priyaRequestAllowView, setPriyaRequestAllowView] = useState(false);
  const [priyaRequestStatus, setPriyaRequestStatus] = useState<'pending' | 'accepted' | 'declined'>('pending');

  // Step 3 — share mode: editing what Riley (a connection you share your graph with) sees of your
  // own contacts. Dana toggles; Casey is always locked (their account opted out).
  const [shareModeOpen, setShareModeOpen] = useState(false);
  const [hiddenFromRiley, setHiddenFromRiley] = useState<Set<string>>(new Set());

  const cameraRef = useRef({ x: 0, y: 0, zoom: 1, targetX: 0, targetY: 0, targetZoom: 1 });

  const [nodes, setNodes] = useState<DemoNode[]>(() => [
    {
      id: 'you',
      name: effectiveUser ? `${effectiveUser.firstName} ${effectiveUser.lastName}` : 'You',
      kind: 'SELF',
      phone: effectiveUser?.phoneNumber ?? '(555) 010-0001',
      bio: 'Exploring my own private network.',
      tags: ['Engineering', 'Design'],
      note: '',
      x: 0, y: 0, vx: 0, vy: 0,
      baseX: -140, baseY: 10,
      radius: 12,
    },
    {
      id: 'dana',
      name: 'Dana Price',
      kind: 'PLACEHOLDER',
      phone: null,
      bio: 'Met at a conference — no account yet, just notes I keep on them.',
      tags: [],
      note: '',
      x: 0, y: 0, vx: 0, vy: 0,
      baseX: -40, baseY: -90,
      radius: 9,
    },
    {
      id: 'riley',
      name: 'Riley Chen',
      kind: 'REGISTERED',
      phone: '(555) 012-3456',
      bio: 'A real account, linked to this contact.',
      tags: ['Design'],
      note: '',
      x: 0, y: 0, vx: 0, vy: 0,
      baseX: -40, baseY: 100,
      radius: 9,
    },
    {
      id: 'casey',
      name: 'Casey Alvarez',
      kind: 'REGISTERED',
      phone: '(555) 019-8765',
      bio: "Registered, but hasn't opted in to being shown in shared graphs.",
      tags: ['Engineering'],
      note: '',
      x: 0, y: 0, vx: 0, vy: 0,
      baseX: 80, baseY: -20,
      radius: 9,
    },
  ]);

  const [links, setLinks] = useState<DemoLink[]>([
    { source: 'you', target: 'dana' },
    { source: 'you', target: 'riley' },
    { source: 'you', target: 'casey' },
  ]);

  // Accepting Priya's request (PLAN.md §1.3): Connect adds her as a REGISTERED contact of yours.
  // Connect *and* Allow-view together also attach her own direct contacts off her node in your
  // graph, tinted "via Priya" — one of which (Jordan) is locked Hidden because Jordan's account
  // hasn't opted in (§1.5). Allow-view alone (no connect) instead only unlocks "Other's graphs"
  // (see the step-4 panel) since you and Priya aren't mutually connected.
  const handleAcceptPriyaRequest = () => {
    setPriyaRequestStatus('accepted');
    setShowNotifications(false);
    if (!priyaRequestConnect) return;

    setNodes((prev) => [
      ...prev,
      {
        id: 'priya', name: 'Priya Anand', kind: 'REGISTERED', phone: '(555) 020-4477',
        bio: 'Connected through a share request.', tags: ['Community'], note: '',
        x: 0, y: 0, vx: 0, vy: 0, baseX: 60, baseY: 60, radius: 9,
      },
      ...(priyaRequestAllowView
        ? [
            {
              id: 'morgan', name: 'Morgan Lee', kind: 'PLACEHOLDER' as DemoKind, phone: null,
              bio: "One of Priya's own contacts — visible because she shares her graph with you.",
              tags: [], note: '', x: 0, y: 0, vx: 0, vy: 0, baseX: 130, baseY: 40, radius: 7,
              viaName: 'Priya',
            },
            {
              id: 'jordan', name: 'Jordan Blake', kind: 'HIDDEN' as DemoKind, phone: null,
              bio: '', tags: [], note: '', x: 0, y: 0, vx: 0, vy: 0, baseX: 130, baseY: 90, radius: 7,
              viaName: 'Priya', locked: true,
            },
          ]
        : []),
    ]);
    setLinks((prev) => [
      ...prev,
      { source: 'you', target: 'priya' },
      ...(priyaRequestAllowView
        ? [{ source: 'priya', target: 'morgan', viaShare: true }, { source: 'priya', target: 'jordan', viaShare: true }]
        : []),
    ]);
  };

  const handleDeclinePriyaRequest = () => {
    setPriyaRequestStatus('declined');
    setShowNotifications(false);
  };


  const handleToggleDemoTag = (nodeId: string, tag: string) => {
    setDemoTagsByNode((prev) => {
      const current = prev[nodeId] ?? nodes.find((n) => n.id === nodeId)?.tags ?? [];
      const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
      return { ...prev, [nodeId]: next };
    });
  };

  const tagsFor = (nodeId: string): string[] => demoTagsByNode[nodeId] ?? nodes.find((n) => n.id === nodeId)?.tags ?? [];

  // Prevent the whole page from pinch-zooming on mobile.
  useEffect(() => {
    const handleTouchPrevent = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener('touchmove', handleTouchPrevent, { passive: false });
    return () => document.removeEventListener('touchmove', handleTouchPrevent);
  }, []);

  // Canvas interaction & simulation loop — domain-agnostic (pan/zoom/drag/click-to-select), only
  // the node/link *data* is private-network flavored.
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
      return { worldX, worldY };
    };

    const hitTest = (worldX: number, worldY: number, pad: number) =>
      nodes.find((n) => {
        const dx = n.x - worldX;
        const dy = n.y - worldY;
        return Math.sqrt(dx * dx + dy * dy) <= n.radius + pad;
      });

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      const { worldX, worldY } = getCanvasCoords(e.clientX, e.clientY);
      const hit = hitTest(worldX, worldY, 8);
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
        canvas.style.cursor = hitTest(worldX, worldY, 8) ? 'pointer' : 'grab';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      cameraRef.current.targetZoom = Math.min(Math.max(cameraRef.current.targetZoom * zoomFactor, 0.45), 2.8);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        lastMouseX = touch.clientX;
        lastMouseY = touch.clientY;
        isDragging = true;
        const { worldX, worldY } = getCanvasCoords(touch.clientX, touch.clientY);
        const hit = hitTest(worldX, worldY, 12);
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
        cameraRef.current.targetZoom = Math.min(Math.max(initialPinchZoom * factor, 0.45), 2.8);
      }
    };

    const handleTouchEnd = () => {
      isDragging = false;
      initialPinchDist = 0;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

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
      ctx.restore();

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

      links.forEach((link) => {
        const s = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!s || !tgt) return;

        const sx = cx + s.x * cam.zoom;
        const sy = cy + s.y * cam.zoom;
        const tx = cx + tgt.x * cam.zoom;
        const ty = cy + tgt.y * cam.zoom;

        let isPathSegment = false;
        if (activePath && activePath.length >= 2) {
          for (let pi = 0; pi < activePath.length - 1; pi++) {
            const pA = activePath[pi];
            const pB = activePath[pi + 1];
            if ((link.source === pA && link.target === pB) || (link.source === pB && link.target === pA)) {
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
        } else if (link.viaShare) {
          ctx.strokeStyle = 'rgba(224, 169, 76, 0.55)';
          ctx.lineWidth = 1.6 * cam.zoom;
          ctx.setLineDash([4, 4]);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 1.4 * cam.zoom;
        }
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();
      });

      nodes.forEach((node) => {
        const nx = cx + node.x * cam.zoom;
        const ny = cy + node.y * cam.zoom;
        const r = node.radius * cam.zoom;
        const isSelected = selectedNodeId === node.id;
        const isOnPath = activePath?.includes(node.id);
        const { fill, dashed, label } = styleForKind(node);

        ctx.save();

        if (node.kind === 'SELF' || isSelected || isOnPath) {
          const glowColor = isOnPath
            ? 'rgba(239, 68, 68, 0.45)'
            : node.kind === 'SELF'
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

        if (isSelected || isOnPath) {
          ctx.strokeStyle = isOnPath ? '#ef4444' : '#6ab0ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(nx, ny, r + 4 * cam.zoom, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(nx, ny, r, 0, Math.PI * 2);
        ctx.fillStyle = isOnPath ? '#ef4444' : fill;
        ctx.fill();
        if (dashed) {
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.font = `${Math.max(10 * cam.zoom, 9)}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isOnPath ? '#f87171' : isSelected ? '#ffffff' : '#b0b0b8';
        const suffix = node.viaName && node.kind !== 'HIDDEN' ? ` (via ${node.viaName})` : '';
        ctx.fillText(`${label}${suffix}`, nx, ny + r + 4);

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
  }, [activeView, nodes, links, selectedNodeId, activePath]);

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
    cameraRef.current.targetZoom = Math.min(Math.max(cameraRef.current.targetZoom * factor, 0.5), 2.5);
  };

  const handleGlobalZoom = () => {
    cameraRef.current.targetX = 0;
    cameraRef.current.targetY = 0;
    cameraRef.current.targetZoom = 0.85;
  };

  // Client-side BFS over the loaded (demo) graph — no server call, same as the real app's
  // find-path (PLAN.md §3: "Search and find-path become client-side over the loaded Graph").
  const handleFindPath = (targetId: string) => {
    if (targetId === 'you') {
      setActivePath(null);
      setPathMessage(null);
      return;
    }
    const adj = new Map<string, string[]>();
    links.forEach((l) => {
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
      for (const n of adj.get(last) || []) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([...p, n]);
        }
      }
    }

    if (foundPath) {
      setActivePath(foundPath);
      const hops = foundPath.length - 1;
      const targetName = nodes.find((n) => n.id === targetId)?.name.split(' ')[0] || 'them';
      setPathMessage(`Found a ${hops}-hop path to ${targetName}`);
    } else {
      setActivePath(null);
      setPathMessage('No path found in your graph yet.');
    }
  };

  const handleExitTutorial = () => {
    if (onClose) onClose();
    else if (effectiveUser) navigate('/');
    else navigate('/login');
  };

  // Leaving step 4 (search & find-path) clears any open demo path — done here, on the actual
  // navigation action, rather than in an effect keyed on currentStep.
  const clearPathIfLeavingStep4 = (nextStep: number) => {
    if (nextStep < 4) {
      setActivePath(null);
      setPathMessage(null);
    }
  };

  const handleNextStep = () => {
    if (currentStep < STEP_TITLES.length - 1) {
      const next = currentStep + 1;
      clearPathIfLeavingStep4(next);
      setCurrentStep(next);
    } else {
      handleExitTutorial();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      clearPathIfLeavingStep4(prev);
      setCurrentStep(prev);
    }
  };

  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) || null : null;

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
        position: 'relative', width: '100%', height: '80vh', overflow: 'hidden',
        background: '#121214', borderRadius: '16px', color: '#f0f0f0', touchAction: 'none', userSelect: 'none',
      }
    : {
        position: 'fixed', inset: 0, width: '100%', height: '100%', maxHeight: '100dvh', overflow: 'hidden',
        background: '#121214', color: '#f0f0f0', touchAction: 'none', userSelect: 'none', overscrollBehavior: 'none',
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

  // Root column ("My contacts") for the step-4/columns demo — your own contacts, sorted, plus the
  // "Other's graphs" entry (only meaningfully populated once Priya's request has been accepted
  // with "let them view").
  const ownContactNodes = nodes.filter((n) => n.kind !== 'SELF' && !n.viaName);
  const otherGraphsAvailable = priyaRequestStatus === 'accepted' && priyaRequestAllowView;
  const nestedShareContacts = nodes.filter((n) => n.viaName === 'Priya');

  const [showOtherGraphs, setShowOtherGraphs] = useState(false);

  const columnItem = (n: DemoNode, onClick: () => void, selected: boolean) => (
    <button
      key={n.id}
      type="button"
      onClick={onClick}
      style={{
        background: selected ? '#2a3f5f' : '#242426',
        border: `1px solid ${selected ? '#3d8bff' : '#2d2d33'}`,
        borderRadius: '8px',
        padding: '10px 12px',
        color: '#f0f0f0',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div
          style={{
            width: 26, height: 26, borderRadius: '50%',
            background: styleForKind(n).fill,
            border: styleForKind(n).dashed ? '1px dashed rgba(255,255,255,0.7)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '11px', fontWeight: 'bold', flexShrink: 0,
          }}
        >
          {n.kind === 'HIDDEN' ? <LockIcon size={12} /> : n.name[0]}
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {n.kind === 'HIDDEN' ? 'Hidden User' : n.name}
          </div>
          <div style={{ fontSize: '11px', color: '#808088', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {kindBadge(n)}
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
          position: 'absolute', top: isMobile ? 8 : 14, left: isMobile ? 10 : 16, right: isMobile ? 10 : 16,
          zIndex: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'auto' }}>
          {currentStep >= 4 ? (
            <div
              style={{
                background: 'rgba(28, 28, 30, 0.94)', backdropFilter: 'blur(16px)', border: '1px solid #3d8bff',
                borderRadius: '8px', padding: '2px', display: 'flex', alignItems: 'center', gap: '2px',
                boxShadow: '0 0 12px rgba(61, 139, 255, 0.35)',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveView('graph')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: isMobile ? '4px 8px' : '5px 12px',
                  borderRadius: '6px', border: 'none', background: activeView === 'graph' ? '#3d8bff' : 'transparent',
                  color: activeView === 'graph' ? '#ffffff' : '#9a9a9a', fontSize: isMobile ? '11px' : '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <GridIcon size={12} /> Graph
              </button>
              <button
                type="button"
                onClick={() => setActiveView('columns')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: isMobile ? '4px 8px' : '5px 12px',
                  borderRadius: '6px', border: 'none', background: activeView === 'columns' ? '#3d8bff' : 'transparent',
                  color: activeView === 'columns' ? '#ffffff' : '#9a9a9a', fontSize: isMobile ? '11px' : '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <ColumnsIcon size={12} /> Columns
              </button>
            </div>
          ) : (
            currentStep >= 1 &&
            !isMobile && (
              <div
                style={{
                  background: 'rgba(28, 28, 30, 0.92)', backdropFilter: 'blur(16px)', border: '1px solid #3a3a40',
                  borderRadius: '8px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px',
                }}
              >
                <SearchIcon size={13} color="#808088" />
                <input
                  type="text"
                  placeholder="Search your contacts..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    const found = ownContactNodes.find((n) => n.name.toLowerCase().includes(e.target.value.toLowerCase()));
                    if (found) setSelectedNodeId(found.id);
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#f0f0f0', fontSize: '11px', outline: 'none', width: 140 }}
                />
              </div>
            )
          )}

          {/* Mailbox: share requests (unlocked in step 2+) */}
          {currentStep >= 2 && (
            <div style={{ position: 'relative', pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => setShowNotifications((prev) => !prev)}
                style={{
                  position: 'relative', background: showNotifications ? '#2a3f5f' : 'rgba(28, 28, 30, 0.92)',
                  backdropFilter: 'blur(16px)', border: `1px solid ${showNotifications ? '#3d8bff' : '#3a3a40'}`,
                  borderRadius: '8px', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
                title="Share requests"
              >
                <MailboxIcon size={15} color={priyaRequestStatus === 'pending' ? '#6ab0ff' : '#808088'} />
                {priyaRequestStatus === 'pending' && (
                  <span
                    style={{
                      position: 'absolute', top: -3, right: -3, background: '#d32f2f', color: 'white', borderRadius: '6px',
                      width: 13, height: 13, fontSize: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    1
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: isMobile ? '260px' : '300px',
                    background: 'rgba(28, 28, 30, 0.98)', backdropFilter: 'blur(20px)', border: '1px solid #3a3a40',
                    borderRadius: '12px', padding: '12px', boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)', zIndex: 40,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#f0f0f0' }}>Share requests</span>
                    <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', color: '#808088', cursor: 'pointer', padding: 2 }}>
                      <CloseIcon size={13} />
                    </button>
                  </div>

                  {priyaRequestStatus === 'pending' ? (
                    <div style={{ background: '#1c1c20', borderRadius: '8px', padding: '8px 10px', border: '1px solid #2d2d33' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#f0f0f0' }}>Priya Anand</div>
                      <div style={{ fontSize: '10px', color: '#808088', marginBottom: '6px' }}>Sent you a share request</div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '4px', color: '#d0d0d0' }}>
                        <input type="checkbox" checked={priyaRequestConnect} onChange={(e) => setPriyaRequestConnect(e.target.checked)} />
                        Connect with her
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginBottom: '8px', color: '#d0d0d0' }}>
                        <input type="checkbox" checked={priyaRequestAllowView} onChange={(e) => setPriyaRequestAllowView(e.target.checked)} />
                        Let her view my graph
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={handleAcceptPriyaRequest}
                          style={{
                            flex: 1, background: '#2e7d32', border: 'none', color: '#fff', borderRadius: '4px', padding: '4px',
                            fontSize: '11px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          }}
                        >
                          <CheckIcon size={12} /> Accept
                        </button>
                        <button
                          type="button"
                          onClick={handleDeclinePriyaRequest}
                          style={{ background: 'rgba(255, 255, 255, 0.08)', border: 'none', color: '#a0a0a5', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: '#808088', textAlign: 'center', padding: '8px 0' }}>
                      {priyaRequestStatus === 'accepted' ? '✓ No pending requests' : 'Request declined'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={handleExitTutorial}
            style={{
              background: '#2a5f9e', border: '1px solid #3d8bff', color: '#ffffff', borderRadius: '6px',
              padding: isMobile ? '4px 10px' : '6px 14px', cursor: 'pointer', fontSize: isMobile ? '11px' : '12px',
              fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px',
              boxShadow: '0 2px 10px rgba(61, 139, 255, 0.35)', whiteSpace: 'nowrap',
            }}
          >
            {isModal ? (
              <>
                <CloseIcon size={13} /> Close
              </>
            ) : effectiveUser ? (
              isMobile ? 'Exit' : 'Exit to Network'
            ) : isMobile ? (
              'Sign In'
            ) : (
              'Sign In (Bypass)'
            )}
          </button>
        </div>
      </div>

      {/* Active-path toast */}
      {activePath && (
        <div
          style={{
            position: 'absolute', top: isMobile ? 44 : 56, left: '50%', transform: 'translateX(-50%)', zIndex: 28,
            background: 'rgba(28, 28, 30, 0.96)', backdropFilter: 'blur(16px)', border: '1px solid #ef4444', borderRadius: '8px',
            padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 16px rgba(239, 68, 68, 0.35)',
            fontSize: isMobile ? '10px' : '11px', color: '#f0f0f0', whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: '#ef4444', fontWeight: 700 }}>PATH:</span>
          <span>{activePath.map((id) => nodes.find((n) => n.id === id)?.name.split(' ')[0]).join(' → ')}</span>
          <button
            type="button"
            onClick={() => { setActivePath(null); setPathMessage(null); }}
            style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            title="Clear path"
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}
      {!activePath && pathMessage && (
        <div
          style={{
            position: 'absolute', top: isMobile ? 44 : 56, left: '50%', transform: 'translateX(-50%)', zIndex: 28,
            background: 'rgba(28, 28, 30, 0.96)', border: '1px solid #3a3a40', borderRadius: '8px', padding: '4px 10px',
            fontSize: '11px', color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <span>{pathMessage}</span>
          <button type="button" onClick={() => setPathMessage(null)} style={{ background: 'none', border: 'none', color: '#808088', cursor: 'pointer', padding: 0 }}>
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {/* Main view area */}
      {activeView === 'graph' ? (
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      ) : (
        <div
          style={{
            position: 'absolute', inset: 0, padding: isMobile ? '46px 12px 130px' : '58px 20px 140px',
            display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '8px' : '14px',
            overflowX: isMobile ? 'hidden' : 'auto', overflowY: isMobile ? 'auto' : 'hidden', background: '#121214', boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              flex: isMobile ? '1 1 auto' : '0 0 270px', width: isMobile ? '100%' : '270px', background: 'rgba(28, 28, 30, 0.94)',
              border: '1px solid #3a3a40', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
              overflowY: 'auto', boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2d2d33', paddingBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#6ab0ff', fontWeight: 700 }}>MY CONTACTS</span>
              <span style={{ fontSize: '11px', color: '#808088' }}>{ownContactNodes.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {columnItem(
                { id: 'other-graphs', name: "Other's graphs", kind: 'PLACEHOLDER', phone: null, bio: '', tags: [], note: '', x: 0, y: 0, vx: 0, vy: 0, baseX: 0, baseY: 0, radius: 0 },
                () => setShowOtherGraphs(true),
                showOtherGraphs
              )}
              {ownContactNodes.map((n) => columnItem(n, () => { setSelectedNodeId(n.id); setShowOtherGraphs(false); }, selectedNodeId === n.id && !showOtherGraphs))}
            </div>
          </div>

          {showOtherGraphs && (
            <div
              style={{
                flex: isMobile ? '1 1 auto' : '0 0 270px', width: isMobile ? '100%' : '270px', background: 'rgba(28, 28, 30, 0.94)',
                border: '1px solid #3a3a40', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
                overflowY: 'auto', boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '11px', fontFamily: 'ui-monospace, Consolas, monospace', color: '#e0a94c', fontWeight: 700, borderBottom: '1px solid #2d2d33', paddingBottom: '8px' }}>
                OTHER'S GRAPHS
              </div>
              {!otherGraphsAvailable ? (
                <p style={{ margin: 0, fontSize: '12px', color: '#808088' }}>
                  Accept Priya's request with "Let her view my graph" (step 3) to unlock a read-only view of her contacts here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#808088' }}>Priya's shared contacts (read-only):</p>
                  {nestedShareContacts.map((n) => columnItem(n, () => setSelectedNodeId(n.id), selectedNodeId === n.id))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating HUD view controls */}
      {currentStep >= 1 && activeView === 'graph' && (
        <div style={{ position: 'absolute', bottom: isMobile ? 120 : 130, right: isMobile ? 10 : 18, zIndex: 25, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button type="button" onClick={handleLocateMe} title="Locate Me" style={hudBtnStyle}>
            <TargetIcon size={16} color="#6ab0ff" />
          </button>
          <button type="button" onClick={() => handleZoom(1.2)} title="Zoom In" style={hudBtnStyle}>
            <PlusIcon size={15} />
          </button>
          <button type="button" onClick={() => handleZoom(0.83)} title="Zoom Out" style={hudBtnStyle}>
            <MinusIcon size={15} />
          </button>
          <button type="button" onClick={handleGlobalZoom} title="Fit Network" style={hudBtnStyle}>
            <MaximizeIcon size={15} />
          </button>
        </div>
      )}

      {/* Profile / contact card for the selected node */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute', top: isMobile ? 44 : 64, left: isMobile ? 10 : 16, right: isMobile ? 10 : 'auto', zIndex: 25,
            width: isMobile ? 'auto' : '290px', maxWidth: isMobile ? '340px' : '290px', maxHeight: isMobile ? '45vh' : 'auto', overflowY: 'auto',
            background: 'rgba(28, 28, 30, 0.96)', backdropFilter: 'blur(20px)', border: '1px solid #3a3a40', borderRadius: '12px',
            padding: isMobile ? '12px' : '14px', boxShadow: '0 16px 40px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: '8px', boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: styleForKind(selectedNode).fill }} />
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f0f0f0' }}>
                  {selectedNode.kind === 'HIDDEN' ? 'Hidden User' : selectedNode.name}
                </h3>
              </div>
              <span style={{ fontSize: '10px', color: '#808088', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                {kindBadge(selectedNode)}
                {selectedNode.viaName && selectedNode.kind !== 'HIDDEN' ? ` · via ${selectedNode.viaName}` : ''}
              </span>
            </div>
            <button
              onClick={() => setSelectedNodeId(null)}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#d0d0d5', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close card"
            >
              <CloseIcon size={13} />
            </button>
          </div>

          {selectedNode.kind === 'HIDDEN' ? (
            <p style={{ margin: 0, fontSize: '11px', color: '#9a9a9a', lineHeight: 1.4 }}>
              This person exists in the shared graph, but hasn't opted in to being shown (or the sharer chose to hide them).
              Nothing else about them is revealed.
            </p>
          ) : (
            <>
              {currentStep >= 4 && selectedNode.id !== 'you' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  <button type="button" onClick={() => handleFindPath(selectedNode.id)} style={primaryButtonStyle}>
                    Find Path
                  </button>
                </div>
              )}

              {(selectedNode.kind === 'REGISTERED' || selectedNode.kind === 'SELF') && selectedNode.phone && (
                <div style={{ background: '#161619', padding: '6px 8px', borderRadius: '6px', border: '1px solid #2d2d33', fontSize: '11px' }}>
                  <span style={{ color: '#808088', fontSize: '10px', display: 'block' }}>Phone:</span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>{selectedNode.phone}</span>
                </div>
              )}

              <p style={{ margin: 0, fontSize: '11px', color: '#b0b0b8', lineHeight: 1.35 }}>{selectedNode.bio}</p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                {tagsFor(selectedNode.id).map((t) => (
                  <span
                    key={t}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', padding: '1px 5px', fontSize: '9.5px',
                      color: '#9ca3af', border: '1px solid #333339', display: 'inline-flex', alignItems: 'center', gap: '2px',
                    }}
                  >
                    <TagIcon size={9} color="#808088" /> {t}
                  </span>
                ))}
              </div>

              {/* Step 1: tags & private notes — "your notepad" — on any of your own contacts. */}
              {currentStep >= 1 && !selectedNode.viaName && selectedNode.id !== 'you' && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '10px', color: '#808088', fontWeight: 700 }}>ADD A TAG</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {['Coworker', 'Neighbor', 'Family'].map((tag) => {
                      const isTagged = tagsFor(selectedNode.id).includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleToggleDemoTag(selectedNode.id, tag)}
                          style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px',
                            border: isTagged ? '1px solid #3d8bff' : '1px solid #3a3a42',
                            background: isTagged ? 'rgba(61, 139, 255, 0.25)' : '#232326',
                            color: isTagged ? '#ffffff' : '#a0a0ab', cursor: 'pointer',
                          }}
                        >
                          {isTagged ? `✓ ${tag}` : `+ ${tag}`}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ margin: '0 0 4px', display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#808088', fontWeight: 700 }}>
                    <span>PRIVATE NOTES</span>
                    <span>Only visible to you</span>
                  </p>
                  {noteRevealed[selectedNode.id] ? (
                    <p style={{ margin: 0, fontSize: '11px', color: '#f0f0f0', background: '#18181b', border: '1px solid #2c2c30', borderRadius: '6px', padding: '6px 8px' }}>
                      Met at the conference — follow up next month.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNoteRevealed((prev) => ({ ...prev, [selectedNode.id]: true }))}
                      style={{ padding: '4px 10px', background: '#232326', border: '1px solid #3a3a40', borderRadius: '6px', color: '#c0c0c6', fontSize: '11px', cursor: 'pointer' }}
                    >
                      + Add Note
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Floating tutorial guidance card */}
      <div
        style={{
          position: 'absolute', bottom: isMobile ? 10 : 16, left: '50%', transform: 'translateX(-50%)', zIndex: 35,
          width: isMobile ? 'calc(100% - 16px)' : 'calc(100% - 32px)', maxWidth: '520px', background: 'rgba(28, 28, 30, 0.96)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid #3a3a40', borderRadius: isMobile ? '12px' : '14px',
          padding: isMobile ? '10px 14px' : '14px 18px', boxShadow: '0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          display: 'flex', flexDirection: 'column', gap: isMobile ? '6px' : '8px', boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2
            style={{
              margin: 0, fontSize: isMobile ? '13px' : '15px', fontWeight: 700,
              background: 'linear-gradient(135deg, #ffffff 40%, #c084fc 80%, #6ab0ff 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            {STEP_TITLES[currentStep]}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {STEP_TITLES.map((_, idx) => (
              <div
                key={idx}
                style={{ width: currentStep === idx ? 16 : 5, height: 5, borderRadius: '3px', background: currentStep === idx ? '#3d8bff' : 'rgba(255, 255, 255, 0.2)', transition: 'all 0.2s ease' }}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', maxHeight: isMobile ? '65px' : '85px' }}>
          {currentStep === 0 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              This graph is <strong style={{ color: '#6ab0ff' }}>private</strong> — just you and the people you add. Tap{' '}
              <strong style={{ color: '#9ca3af' }}>Dana</strong> (dashed = a placeholder you wrote yourself, no account) vs.{' '}
              <strong style={{ color: '#22c55e' }}>Riley</strong> or <strong style={{ color: '#22c55e' }}>Casey</strong> (solid =
              registered, linked to a real account). "Add person" creates a new placeholder you can later link to a real account.
            </p>
          )}
          {currentStep === 1 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              Tap a contact and use <strong style={{ color: '#6ab0ff' }}>Tags</strong> and{' '}
              <strong style={{ color: '#6ab0ff' }}>Private Notes</strong> — your own notepad on them. Tags help you filter and
              search later; notes are never shared with anyone, even if you share your graph.
            </p>
          )}
          {currentStep === 2 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              Open the mailbox — <strong style={{ color: '#6ab0ff' }}>Priya</strong> sent a share request. Two independent
              choices: <strong>Connect</strong> (become mutual contacts) and <strong>Let her view my graph</strong> (a live,
              read-only look at your direct contacts). Try checking both.
            </p>
          )}
          {currentStep === 3 && (
            <div>
              <p style={{ margin: '0 0 6px 0', fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
                <strong style={{ color: '#6ab0ff' }}>Share Mode:</strong> you're editing what Riley sees of your graph. Toggle{' '}
                <strong>Dana</strong> between visible and Hidden User. <strong>Casey</strong> is locked Hidden — their account
                hasn't opted in to being shown in shared graphs, so you can't reveal them even if you wanted to.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShareModeOpen((prev) => !prev)}
                  style={{ padding: '4px 10px', background: shareModeOpen ? '#2a3f5f' : '#232326', border: '1px solid #3a3a40', borderRadius: '6px', color: '#d0d0d0', fontSize: '11px', cursor: 'pointer' }}
                >
                  {shareModeOpen ? 'Close share mode' : 'Edit what Riley sees'}
                </button>
              </div>
              {shareModeOpen && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setHiddenFromRiley((prev) => {
                      const next = new Set(prev);
                      if (next.has('dana')) next.delete('dana');
                      else next.add('dana');
                      return next;
                    })}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px',
                      background: '#1c1c20', border: '1px solid #2d2d33', borderRadius: '6px', color: '#f0f0f0', fontSize: '11px', cursor: 'pointer',
                    }}
                  >
                    <span>Dana Price</span>
                    <span style={{ color: hiddenFromRiley.has('dana') ? '#9a9a9a' : '#4ade80' }}>
                      {hiddenFromRiley.has('dana') ? 'Hidden User' : 'Visible'}
                    </span>
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#1c1c20', border: '1px solid #2d2d33', borderRadius: '6px', color: '#808088', fontSize: '11px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LockIcon size={11} /> Casey Alvarez
                    </span>
                    <span>Hidden User (locked)</span>
                  </div>
                </div>
              )}
            </div>
          )}
          {currentStep === 4 && (
            <p style={{ margin: 0, fontSize: isMobile ? '11px' : '12px', color: '#c5c5c7', lineHeight: 1.35 }}>
              Switch to <strong style={{ color: '#3d8bff' }}>Columns</strong> to browse "Other's graphs" — Priya's contacts,
              read-only. Tap <strong>Find Path</strong> on Morgan (if connected + shared) to see a multi-hop path through your
              graph, or use the search box to find your own contacts by name.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={currentStep === 0}
            style={{
              background: 'rgba(47, 48, 58, 0.5)', border: '1px solid #3a3a40', color: currentStep === 0 ? '#505058' : '#d5d3da',
              borderRadius: '6px', padding: isMobile ? '5px 12px' : '6px 14px', fontSize: isMobile ? '11px' : '12px',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: currentStep === 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeftIcon size={13} /> Back
          </button>

          <button
            type="button"
            onClick={handleNextStep}
            style={{
              background: currentStep === STEP_TITLES.length - 1 ? '#2e7d32' : '#2a5f9e',
              border: currentStep === STEP_TITLES.length - 1 ? '1px solid #4caf50' : '1px solid #3d8bff',
              color: '#ffffff', borderRadius: '6px', padding: isMobile ? '5px 14px' : '6px 16px', fontSize: isMobile ? '11px' : '12px',
              fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 10px rgba(61, 139, 255, 0.35)',
            }}
          >
            {currentStep === STEP_TITLES.length - 1 ? (
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
