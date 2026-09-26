import { useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { Share } from '../services/shareService';
import { drawGrid, drawNode, linkColorFor, linkLineDashFor, paintNodePointerArea, useGraphPhysics, STATIC_LAYOUT } from '../graph/rendering';
import type { GNode, GLink } from '../graph/rendering';
import type { ForceGraphData } from '../graph/mapping';
import { CloseIcon } from './Icons';

interface OtherGraphViewProps {
  share: Share;
  data: ForceGraphData | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const EMPTY_SET = new Set<string>();

// F6 "Other's graphs": a read-only view of someone else's graph as they've shared it with you
// (`GET /api/shares/{id}/graph`) — same renderer as your own graph, but no interactivity at all:
// no click-to-select, no edit affordances, just the visual. A clear banner and close/back control
// so it's never mistaken for your own graph.
export const OtherGraphView = ({ share, data, loading, error, onClose }: OtherGraphViewProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const [size] = useState({ width: window.innerWidth, height: window.innerHeight });
  useGraphPhysics(fgRef, data?.links ?? []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#121214' }}>
      {data && !loading && !error && (
        <ForceGraph2D<GNode, GLink>
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="#121214"
          enableNodeDrag={false}
          {...STATIC_LAYOUT}
          onRenderFramePre={(ctx, globalScale) => drawGrid(ctx, globalScale)}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node, ctx, globalScale, { highlightNodes: EMPTY_SET, activePath: null })
          }
          linkColor={(link) => linkColorFor(link as GLink, { highlightLinks: EMPTY_SET, activePath: null })}
          linkLineDash={(link) => linkLineDashFor(link as GLink)}
          nodePointerAreaPaint={paintNodePointerArea}
          onNodeClick={undefined}
          onBackgroundClick={undefined}
        />
      )}

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9a9a' }}>
          Loading {share.sharerName}'s graph...
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6b' }}>
          {error}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top, 12px))',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 65,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(28, 28, 30, 0.94)',
          border: '1px solid #3a3a40',
          borderRadius: '20px',
          padding: '8px 16px',
          color: '#f0f0f0',
          fontSize: '13px',
        }}
      >
        <span>Viewing {share.sharerName}'s graph — read only</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{ minWidth: 32, minHeight: 32, background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>
  );
};
