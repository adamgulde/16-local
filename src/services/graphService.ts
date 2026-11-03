import { buildGraph, getSelfProfile, updateSelfProfile, type SelfProfile } from '../data/graph';
import { db } from '../data/store';
import type { Graph } from '../data/types';

export type {
  Graph,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  NodeKind,
  Strength,
  Tag,
} from '../data/types';

/** Your whole local graph: you at the centre, your contacts and their links. */
export const fetchGraph = async (): Promise<Graph> => buildGraph(db());

export type { SelfProfile };

export const fetchSelfProfile = (): Promise<SelfProfile> => getSelfProfile(db());

export const updateSelf = (patch: Partial<SelfProfile>): Promise<void> => updateSelfProfile(db(), patch);
