import { parsePromptRequest } from '../prompt-request';
import { PipelineError } from './errors';
import type {
  FeatureSpecification,
  ProjectConstraint,
  ProjectSpecification,
} from './types';

const DEFAULT_FEATURES: FeatureSpecification[] = [
  {
    id: 'student-crud',
    name: 'Student CRUD',
    description: 'Create, list with pagination/search/sort, get by id, update, and delete students.',
    required: true,
  },
];

const DEFAULT_CONSTRAINTS: ProjectConstraint[] = [
  {
    id: 'no-silent-stack-swap',
    description: 'Do not replace any selected core technology.',
  },
  {
    id: 'bounded-batches',
    description: 'Generate source in bounded batches of at most 8 files.',
  },
  {
    id: 'no-fake-execution',
    description: 'Do not claim commands ran unless verification results exist.',
  },
];

export type BuildSpecificationInput = {
  symbols: string[];
  backendRuntime: string;
  authentication: boolean;
  projectName?: string;
  description?: string;
  features?: FeatureSpecification[];
  constraints?: ProjectConstraint[];
};

export function buildProjectSpecification(input: BuildSpecificationInput): ProjectSpecification {
  const parsed = parsePromptRequest({
    symbols: input.symbols,
    backendRuntime: input.backendRuntime,
    authentication: input.authentication,
  });

  if (parsed.ok === false) {
    throw new PipelineError('INVALID_PROJECT_SPEC', parsed.error);
  }

  const { stack, authentication } = parsed.value;
  const frontend = stack[0];
  const backend = stack[1];
  const database = stack[2];
  const runtime = backend.runtime;

  if (!runtime) {
    throw new PipelineError('INVALID_PROJECT_SPEC', 'Backend runtime is required.');
  }

  return {
    projectName: input.projectName?.trim() || 'student-management-system',
    description: input.description?.trim()
      || 'A Student Management System vertical slice with student CRUD.',
    stack: {
      frontend: { id: frontend.id, name: frontend.name, role: 'frontend' },
      backend: { id: backend.id, name: backend.name, role: 'backend-framework' },
      runtime: { id: runtime.id, name: runtime.name, role: 'backend-runtime' },
      database: { id: database.id, name: database.name, role: 'database' },
    },
    authentication: {
      enabled: authentication,
      ...(authentication ? { roles: ['ADMIN', 'STAFF'] } : {}),
    },
    features: input.features ?? DEFAULT_FEATURES,
    constraints: input.constraints ?? DEFAULT_CONSTRAINTS,
  };
}

export function serializeStackForPrompt(spec: ProjectSpecification): string {
  // Structured JSON prevents instruction-injection via technology display names.
  return JSON.stringify({
    frontend: { id: spec.stack.frontend.id, name: spec.stack.frontend.name },
    backend: { id: spec.stack.backend.id, name: spec.stack.backend.name },
    runtime: { id: spec.stack.runtime.id, name: spec.stack.runtime.name },
    database: { id: spec.stack.database.id, name: spec.stack.database.name },
    authentication: spec.authentication,
  }, null, 2);
}
