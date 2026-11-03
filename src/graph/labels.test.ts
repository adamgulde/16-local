import { describe, expect, it } from 'vitest';
import { LABEL_VISIBILITY_SCALE, drawNode, drawTagPolygons, type GNode } from './rendering';
import type { ForceGraphData } from './mapping';

// A canvas stand-in that records which text was drawn.
const recordingCtx = () => {
  const texts: string[] = [];
  const ctx = new Proxy(
    { texts, fillText: (t: string) => texts.push(t) } as Record<string, unknown>,
    {
      get: (target, prop) => (prop in target ? target[prop as string] : () => undefined),
      set: () => true,
    }
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
};

const node = { id: 'a', kind: 'PLACEHOLDER', name: 'Ann Apple', x: 0, y: 0, direct: true, tagIds: ['t'] } as unknown as GNode;
const opts = { highlightNodes: new Set<string>(), activePath: null };

describe('labels when zoomed out', () => {
  it('hides person names far out, even for a selected person', () => {
    const far = recordingCtx();
    drawNode(node, far.ctx, LABEL_VISIBILITY_SCALE / 2, { ...opts, highlightNodes: new Set(['a']) });
    expect(far.texts).not.toContain('Ann Apple');

    const near = recordingCtx();
    drawNode(node, near.ctx, LABEL_VISIBILITY_SCALE * 2, opts);
    expect(near.texts).toContain('Ann Apple');
  });

  it('keeps tag group names at every zoom', () => {
    const data: ForceGraphData = {
      nodes: [
        { id: 'a', kind: 'PLACEHOLDER', name: 'A', phoneNumber: null, editable: true, strength: 5, direct: true, tagIds: ['t'], val: 5, x: 0, y: 0 },
        { id: 'b', kind: 'PLACEHOLDER', name: 'B', phoneNumber: null, editable: true, strength: 5, direct: true, tagIds: ['t'], val: 5, x: 40, y: 0 },
      ],
      links: [],
      groups: [{ id: 't', label: 'Climbing' }],
    };
    const far = recordingCtx();
    drawTagPolygons(far.ctx, 0.1, data);
    expect(far.texts).toEqual(['Climbing']);
  });
});

describe('node opacity when zoomed out', () => {
  it('is fully opaque when zoomed in, fades as you zoom out, and bottoms out', async () => {
    const { nodeAlphaForScale } = await import('./rendering');
    expect(nodeAlphaForScale(2)).toBe(1);
    expect(nodeAlphaForScale(1)).toBe(1);
    expect(nodeAlphaForScale(0.65)).toBeGreaterThan(nodeAlphaForScale(0.4));
    expect(nodeAlphaForScale(0.4)).toBeGreaterThan(nodeAlphaForScale(0.1));
    expect(nodeAlphaForScale(0.1)).toBeCloseTo(0.55);
  });
});
