import { useState, useRef, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react';

interface DraggableCardProps {
  id: string;
  initialX: number;
  initialY: number;
  width?: string | number;
  maxHeight?: string | number;
  zIndex?: number;
  onBringToFront?: () => void;
  style?: CSSProperties;
  children: ReactNode;
  dragHandleText?: string;
  borderColor?: string;
}

export const DraggableCard = ({
  initialX,
  initialY,
  width = 380,
  maxHeight = 'calc(100vh - 90px)',
  zIndex = 25,
  onBringToFront,
  style,
  children,
  dragHandleText = 'Drag to move',
  borderColor = '#3a3a40',
}: DraggableCardProps) => {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // If initialX / initialY change when card mounts or resets
  useEffect(() => {
    setPos({ x: initialX, y: initialY });
  }, [initialX, initialY]);

  // Keep card inside viewport bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => ({
        x: Math.max(10, Math.min(window.innerWidth - 320, prev.x)),
        y: Math.max(64, Math.min(window.innerHeight - 100, prev.y)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Left click only
      if (e.button !== 0) return;
      // Do not trigger drag if clicking an interactive element inside the handle
      if ((e.target as HTMLElement).closest('button, input, a, textarea')) return;

      onBringToFront?.();
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        posX: pos.x,
        posY: pos.y,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = moveEvent.clientX - dragRef.current.startX;
        const dy = moveEvent.clientY - dragRef.current.startY;
        const cardW = typeof width === 'number' ? width : 380;
        const newX = Math.max(10, Math.min(window.innerWidth - cardW - 10, dragRef.current.posX + dx));
        const newY = Math.max(64, Math.min(window.innerHeight - 80, dragRef.current.posY + dy));
        setPos({ x: newX, y: newY });
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        dragRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [pos.x, pos.y, width, onBringToFront]
  );

  return (
    <div
      onMouseDown={onBringToFront}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width,
        maxHeight,
        zIndex,
        display: 'flex',
        flexDirection: 'column',
        userSelect: isDragging ? 'none' : 'auto',
        background: 'rgba(28, 28, 30, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        boxShadow: isDragging
          ? '0 16px 40px rgba(0, 0, 0, 0.8), 0 0 16px rgba(61, 139, 255, 0.25)'
          : '0 8px 32px rgba(0, 0, 0, 0.6)',
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        overflow: 'hidden',
        pointerEvents: 'auto',
        ...style,
      }}
    >
      {/* Draggable Grip Handle */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '5px 10px',
          background: isDragging ? 'rgba(61, 139, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          cursor: isDragging ? 'grabbing' : 'grab',
          fontSize: '11px',
          color: isDragging ? '#6ab0ff' : '#8a8a92',
          letterSpacing: '0.5px',
          flexShrink: 0,
          touchAction: 'none',
        }}
        title="Click and drag to move card"
      >
        <span style={{ letterSpacing: '2px', fontWeight: 'bold' }}>⠿</span>
        <span>{dragHandleText}</span>
      </div>

      {/* Card Content Area */}
      <div style={{ overflowY: 'auto', flex: 1 }}>{children}</div>
    </div>
  );
};
