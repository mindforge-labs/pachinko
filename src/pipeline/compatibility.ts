import { compatibleRuntimeIds, technologyById } from '../techstack';
import {
  DATABASES_REQUIRING_ADAPTER,
  EDGE_ORIENTED_RUNTIME_IDS,
  getTechPromptMetadata,
} from './stack-metadata';
import type {
  CompatibilityWarning,
  ProjectSpecification,
  ResolvedAdapter,
  StackCompatibilityResult,
  StackConflict,
  StackResolutionOption,
} from './types';

export type CompatibilityInput = {
  frontendId: string;
  backendFrameworkId: string;
  runtimeId: string;
  databaseId: string;
};

/**
 * Deterministic stack compatibility gate.
 * LLM may later enrich warnings; it must not be the sole source of these rules.
 */
export function validateStackCompatibility(input: CompatibilityInput): StackCompatibilityResult {
  const conflicts: StackConflict[] = [];
  const warnings: CompatibilityWarning[] = [];
  const resolutionOptions: StackResolutionOption[] = [];
  const resolvedAdapters: ResolvedAdapter[] = [];

  const frontend = technologyById(input.frontendId);
  const backend = technologyById(input.backendFrameworkId);
  const runtime = technologyById(input.runtimeId);
  const database = technologyById(input.databaseId);

  if (!frontend?.roles.includes('frontend')) {
    conflicts.push({
      code: 'unsupported-frontend',
      message: `Frontend technology "${input.frontendId}" is not supported.`,
      technologyIds: [input.frontendId],
    });
  }
  if (!backend?.roles.includes('backend-framework')) {
    conflicts.push({
      code: 'unsupported-backend',
      message: `Backend framework "${input.backendFrameworkId}" is not supported.`,
      technologyIds: [input.backendFrameworkId],
    });
  }
  if (!runtime?.roles.includes('backend-runtime')) {
    conflicts.push({
      code: 'unsupported-runtime',
      message: `Runtime "${input.runtimeId}" is not a backend runtime.`,
      technologyIds: [input.runtimeId],
    });
  }
  if (!database?.roles.includes('database')) {
    conflicts.push({
      code: 'unsupported-database',
      message: `Database "${input.databaseId}" is not supported.`,
      technologyIds: [input.databaseId],
    });
  }

  if (conflicts.length) {
    return { compatible: false, conflicts, resolutionOptions };
  }

  const allowedRuntimes = compatibleRuntimeIds(input.backendFrameworkId);
  if (!allowedRuntimes.includes(input.runtimeId)) {
    conflicts.push({
      code: 'incompatible-backend-runtime',
      message: `${runtime!.name} is not compatible with ${backend!.name}.`,
      technologyIds: [input.backendFrameworkId, input.runtimeId],
    });
    resolutionOptions.push({
      id: 'switch-runtime',
      summary: `Use a compatible runtime for ${backend!.name}`,
      changes: allowedRuntimes.slice(0, 3).map((to) => ({
        field: 'runtime',
        from: input.runtimeId,
        to,
      })),
    });
  }

  const backendMeta = getTechPromptMetadata(input.backendFrameworkId, backend!.name);
  const runtimeMeta = getTechPromptMetadata(input.runtimeId, runtime!.name);
  const databaseMeta = getTechPromptMetadata(input.databaseId, database!.name);

  // Unverified backend↔database pairings are warnings, not hard stops.
  // The reels already allow any DB with any framework; only framework↔runtime is gated in the matrix.
  // Treating an incomplete metadata allowlist as incompatible blocked most rolled stacks before planning.
  if (backendMeta.supportedDatabaseIds && !backendMeta.supportedDatabaseIds.includes(input.databaseId)) {
    warnings.push({
      code: 'unverified-backend-database',
      message: `${backend!.name} has no pre-verified path for ${database!.name}; the plan must choose a concrete driver/ORM.`,
      technologyIds: [input.backendFrameworkId, input.databaseId],
    });
    if (backendMeta.supportedDatabaseIds.length) {
      resolutionOptions.push({
        id: 'prefer-verified-database',
        summary: `Prefer a database already verified for ${backend!.name}`,
        changes: backendMeta.supportedDatabaseIds.slice(0, 3).map((to) => ({
          field: 'database',
          from: input.databaseId,
          to,
        })),
      });
    }
  }

  if (runtimeMeta.supportedDatabaseIds && !runtimeMeta.supportedDatabaseIds.includes(input.databaseId)) {
    warnings.push({
      code: 'unverified-runtime-database',
      message: `${runtime!.name} has no pre-verified driver path for ${database!.name}; confirm driver support in the architecture plan.`,
      technologyIds: [input.runtimeId, input.databaseId],
    });
  }

  if (DATABASES_REQUIRING_ADAPTER.has(input.databaseId)) {
    const adapters = databaseMeta.recommendedAdapters ?? backendMeta.recommendedAdapters ?? [];
    if (!adapters.length) {
      warnings.push({
        code: 'adapter-unspecified',
        message: `${database!.name} usually needs a client adapter; none is pre-resolved for this stack.`,
        technologyIds: [input.databaseId],
      });
    } else {
      resolvedAdapters.push({
        category: 'database-driver',
        packageName: adapters[0],
        purpose: `Connect ${backend!.name} on ${runtime!.name} to ${database!.name}`,
        forTechnologyId: input.databaseId,
      });
    }
  }

  if (
    EDGE_ORIENTED_RUNTIME_IDS.has(input.runtimeId)
    && (backendMeta.dockerSupport === 'production' || runtimeMeta.dockerSupport === 'development-only')
  ) {
    warnings.push({
      code: 'docker-production-unsuitable-for-edge',
      message: `${runtime!.name} is edge-oriented; treat Docker as local-dev-only and prefer an edge deploy target.`,
      technologyIds: [input.runtimeId, input.backendFrameworkId],
    });
    resolutionOptions.push({
      id: 'use-dev-docker-only',
      summary: 'Treat Docker as local-development-only and deploy to an edge platform',
      changes: [{ field: 'dockerSupport', from: 'production', to: 'development-only' }],
    });
  }

  if (databaseMeta.dockerSupport === 'none') {
    warnings.push({
      code: 'database-no-local-docker',
      message: `${database!.name} has no local Docker production story; plan for a managed service.`,
      technologyIds: [input.databaseId],
    });
  }

  if (databaseMeta.dockerSupport === 'development-only') {
    warnings.push({
      code: 'database-dev-docker-only',
      message: `${database!.name} Docker support is development-only.`,
      technologyIds: [input.databaseId],
    });
  }

  if (!backendMeta.migrateCommand && !['sqlite'].includes(input.databaseId)) {
    warnings.push({
      code: 'migration-strategy-unspecified',
      message: `No default migration command is registered for ${backend!.name}; the architecture plan must define one.`,
      technologyIds: [input.backendFrameworkId],
    });
  }

  if (conflicts.length) {
    return { compatible: false, conflicts, resolutionOptions };
  }

  return { compatible: true, warnings, resolvedAdapters };
}

export function validateSpecificationCompatibility(
  spec: ProjectSpecification,
): StackCompatibilityResult {
  return validateStackCompatibility({
    frontendId: spec.stack.frontend.id,
    backendFrameworkId: spec.stack.backend.id,
    runtimeId: spec.stack.runtime.id,
    databaseId: spec.stack.database.id,
  });
}
