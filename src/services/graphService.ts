import { buildGraph } from '../data/graph';
import { db } from '../data/store';
import type { Graph } from '../data/types';

export type {
  Graph,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  NodeKind,
  Strength,
  TagAssignment,
  TagKind,
} from '../data/types';

/** Your whole local graph: you at the centre, your contacts and their links. */
export const fetchGraph = async (): Promise<Graph> => buildGraph(db());
