export type DeploymentModel =
  | 'container'
  | 'serverless'
  | 'edge'
  | 'managed'
  | 'static';

export type DockerSupport =
  | 'production'
  | 'development-only'
  | 'none';

export type TechPromptMetadata = {
  id: string;
  name: string;
  version?: string;
  packageName?: string;
  scaffoldCommand?: string;
  deploymentModel?: DeploymentModel;
  dockerSupport?: DockerSupport;
  compatibleRuntimeIds?: string[];
  supportedDatabaseIds?: string[];
  recommendedAdapters?: string[];
  installCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  buildCommand?: string;
  migrateCommand?: string;
  seedCommand?: string;
};

export type SelectedTech = {
  id: string;
  name: string;
  role: 'frontend' | 'backend-framework' | 'backend-runtime' | 'database';
};

export type AuthenticationConfig = {
  enabled: boolean;
  roles?: string[];
};

export type FeatureSpecification = {
  id: string;
  name: string;
  description: string;
  required: boolean;
};

export type ProjectConstraint = {
  id: string;
  description: string;
};

export type ProjectSpecification = {
  projectName: string;
  description: string;
  stack: {
    frontend: SelectedTech;
    backend: SelectedTech;
    runtime: SelectedTech;
    database: SelectedTech;
  };
  authentication: AuthenticationConfig;
  features: FeatureSpecification[];
  constraints: ProjectConstraint[];
};

export type CompatibilityWarning = {
  code: string;
  message: string;
  technologyIds?: string[];
};

export type StackConflict = {
  code: string;
  message: string;
  technologyIds: string[];
};

export type StackResolutionOption = {
  id: string;
  summary: string;
  changes: Array<{ field: string; from: string; to: string }>;
};

export type ResolvedAdapter = {
  category: string;
  packageName: string;
  purpose: string;
  forTechnologyId: string;
};

export type StackCompatibilityResult =
  | {
      compatible: true;
      warnings: CompatibilityWarning[];
      resolvedAdapters: ResolvedAdapter[];
    }
  | {
      compatible: false;
      conflicts: StackConflict[];
      resolutionOptions: StackResolutionOption[];
    };

export type SupportingDependencyDecision = {
  packageName: string;
  version: string;
  category: string;
  purpose: string;
  reasonBuiltInCapabilityIsInsufficient: string;
};

export type RepositoryNode = {
  path: string;
  type: 'file' | 'directory';
  description?: string;
};

export type PlannedFile = {
  path: string;
  purpose: string;
  batchId: string;
};

export type GenerationBatchPlan = {
  batchId: string;
  title: string;
  goal: string;
  allowedFiles: string[];
  dependsOn: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
};

export type VerificationStep = {
  id: string;
  name: string;
  command: string[];
  required: boolean;
  cwd?: string;
};

export type ArchitecturePlan = {
  summary: string;
  assumptions: string[];
  dependencies: SupportingDependencyDecision[];
  repositoryTree: RepositoryNode[];
  files: PlannedFile[];
  batches: GenerationBatchPlan[];
  verificationPlan: VerificationStep[];
};

export type GeneratedFile = {
  path: string;
  operation: 'create' | 'update' | 'delete';
  content?: string;
};

export type SuggestedCommand = {
  label: string;
  command: string[];
  cwd?: string;
};

export type GenerationBatchResult = {
  batchId: string;
  summary: string;
  files: GeneratedFile[];
  commands: SuggestedCommand[];
  notes: string[];
};

export type VerificationStatus =
  | 'not_run'
  | 'static_validated'
  | 'passed'
  | 'failed'
  | 'skipped';

export type CommandResult = {
  command: string[];
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  rejected?: string;
};

export type VerificationResult = {
  stepId: string;
  status: VerificationStatus;
  command?: CommandResult;
  message?: string;
};

export type RepairPolicy = {
  maxAttemptsPerFailure: number;
  maxTotalRepairAttempts: number;
  maxFilesPerRepair: number;
  maxErrorOutputCharacters: number;
};

export const defaultRepairPolicy: RepairPolicy = {
  maxAttemptsPerFailure: 3,
  maxTotalRepairAttempts: 8,
  maxFilesPerRepair: 5,
  maxErrorOutputCharacters: 20_000,
};

export type RepairResult = {
  summary: string;
  files: GeneratedFile[];
  notes: string[];
};

export type PipelineStage =
  | 'initializing'
  | 'analyzing'
  | 'validating_stack'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'generating_batch'
  | 'writing_files'
  | 'verifying_batch'
  | 'repairing'
  | 'final_verification'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type FinalProjectStatus =
  | 'verified'
  | 'partially_verified'
  | 'generated_not_executed'
  | 'awaiting_plan_approval'
  | 'stack_incompatible'
  | 'failed';

export type GenerationMode = 'legacy-one-shot' | 'pipeline';

export type PipelineRunLog = {
  runId: string;
  projectId: string;
  stage: PipelineStage;
  currentBatchId?: string;
  stackIds: string[];
  model?: string;
  modelRequestId?: string;
  startedAt: string;
  updatedAt: string;
  tokenUsage?: { promptTokens?: number; completionTokens?: number };
  commandSummaries: Array<{
    command: string[];
    exitCode: number | null;
    durationMs: number;
    status: 'ok' | 'failed' | 'timeout' | 'rejected' | 'cancelled';
  }>;
  changedFiles: string[];
  repairAttempts: number;
  finalStatus?: FinalProjectStatus;
};

export type FinalProjectReport = {
  status: FinalProjectStatus;
  stack: ProjectSpecification['stack'];
  compatibilityWarnings: CompatibilityWarning[];
  architectureSummary?: string;
  generatedBatches: Array<{ batchId: string; summary: string; fileCount: number }>;
  files: Array<{ path: string; operation: string }>;
  commandsExecuted: CommandResult[];
  verificationResults: VerificationResult[];
  repairAttempts: number;
  unresolvedIssues: string[];
  howToRun: string[];
  limitations: string[];
  nextDeploymentSteps: string[];
  runLog: PipelineRunLog;
};

export type PipelineCheckpoint = {
  runId: string;
  stage: PipelineStage;
  specification: ProjectSpecification;
  compatibility: StackCompatibilityResult;
  architecturePlan?: ArchitecturePlan;
  completedBatchIds: string[];
  currentBatchId?: string;
  workspaceRoot: string;
  repairAttempts: number;
  verificationResults: VerificationResult[];
  filesApplied: Array<{ path: string; operation: string; batchId: string }>;
  updatedAt: string;
};
