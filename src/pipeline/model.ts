import type {
  ArchitecturePlan,
  GenerationBatchResult,
  RepairResult,
} from './types';

export type ArchitecturePlanningInput = {
  system: string;
  user: string;
};

export type BatchGenerationInput = {
  system: string;
  user: string;
  batchId: string;
  allowlist: string[];
};

export type RepairInput = {
  system: string;
  user: string;
  allowlist: string[];
  maxFiles: number;
};

/**
 * Provider-agnostic model boundary. Gemini-specific types stay in the adapter.
 */
export interface ProjectGenerationModel {
  planArchitecture(input: ArchitecturePlanningInput): Promise<ArchitecturePlan>;
  generateBatch(input: BatchGenerationInput): Promise<GenerationBatchResult>;
  repairFailure(input: RepairInput): Promise<RepairResult>;
}
