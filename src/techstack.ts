import matrixJson from './techstack-matrix.json';
import { DEVICON_CATALOG } from './generated/devicon-catalog';
import {
  validateTechStackMatrix,
  type MatrixTechnology,
  type TechRole,
  type TechSource,
} from './techstack-matrix';

export type ReelLayer = 'fe' | 'be' | 'db';

export type Tech = {
  id: string;
  name: string;
  short: string;
  devicon: string | null;
  iconUrl: string;
  docsUrl: string;
  githubUrl: string | null;
  tags: string[];
  color: string | null;
  roles: TechRole[];
  source: TechSource;
};

export type BackendPair = { frameworkId: string; runtimeId: string };

export type DescribedStackItem = {
  layer: ReelLayer;
  layerLabel: string;
  id: string;
  name: string;
  short: string;
  docsUrl: string;
  iconUrl: string;
  runtime?: {
    id: string;
    name: string;
    short: string;
    docsUrl: string;
    iconUrl: string;
  };
};

/** Physical reels remain FE | BE framework | DB. */
export const REEL_LAYERS: ReelLayer[] = ['fe', 'be', 'db'];
export const LAYER_LABELS = { fe: 'Frontend', be: 'Backend', db: 'Database' } as const;
const ROLE_FOR_LAYER: Record<ReelLayer, TechRole> = {
  fe: 'frontend',
  be: 'backend-framework',
  db: 'database',
};

export const MATRIX_VALIDATION = validateTechStackMatrix(matrixJson);
if (!MATRIX_VALIDATION.matrix) {
  throw new Error(`Invalid committed tech-stack matrix: ${MATRIX_VALIDATION.errors.map(({ message }) => message).join(' ')}`);
}
export const TECH_STACK_MATRIX = MATRIX_VALIDATION.matrix;
export const REROLL_LIMITS = { ...TECH_STACK_MATRIX.rerollLimits };

const devicons = new Map(DEVICON_CATALOG.map((item) => [item.id, item]));

const resolveTechnology = (entry: MatrixTechnology): Tech => {
  const upstream = entry.source.type === 'devicon' ? devicons.get(entry.source.sourceId) : null;
  return {
    id: entry.id,
    name: entry.name,
    short: entry.short,
    devicon: upstream?.id ?? null,
    iconUrl: upstream?.iconUrl ?? entry.iconUrl!,
    docsUrl: entry.docsUrl,
    githubUrl: null,
    tags: upstream?.tags ?? [],
    color: upstream?.color ?? null,
    roles: [...entry.roles],
    source: entry.source,
  };
};

export const TECHNOLOGIES = TECH_STACK_MATRIX.technologies
  .filter(({ enabled }) => enabled)
  .map(resolveTechnology);

const technologyMap = new Map(TECHNOLOGIES.map((tech) => [tech.id, tech]));

export const TECH_STACK: Record<ReelLayer, Tech[]> = Object.fromEntries(
  REEL_LAYERS.map((layer) => [layer, TECHNOLOGIES.filter(({ roles }) => roles.includes(ROLE_FOR_LAYER[layer]))]),
) as Record<ReelLayer, Tech[]>;

export const BACKEND_RUNTIMES = TECHNOLOGIES.filter(({ roles }) => roles.includes('backend-runtime'));
export const BACKEND_COMPATIBILITY = new Map(
  TECH_STACK_MATRIX.compatibility.map(({ frameworkId, runtimeIds }) => [frameworkId, [...runtimeIds]]),
);

export function layerForReel(index: number): ReelLayer {
  return REEL_LAYERS[index] ?? 'fe';
}

export function technologyById(id: string) {
  return technologyMap.get(id) ?? null;
}

export function techById(layer: ReelLayer, id: string) {
  const tech = technologyById(id);
  return tech?.roles.includes(ROLE_FOR_LAYER[layer]) ? tech : null;
}

const randomIndex = (length: number, random: () => number) => Math.min(length - 1, Math.max(0, Math.floor(random() * length)));

export function pickTech(index: number, random = Math.random) {
  const pool = TECH_STACK[layerForReel(index)];
  return pool[randomIndex(pool.length, random)].id;
}

export function pickDifferentTech(index: number, currentId: string, random = Math.random) {
  const pool = TECH_STACK[layerForReel(index)];
  const candidates = pool.filter(({ id }) => id !== currentId);
  if (!candidates.length) throw new Error(`Reel ${index} has no alternative technology.`);
  return candidates[randomIndex(candidates.length, random)].id;
}

export function compatibleRuntimeIds(frameworkId: string) {
  return [...(BACKEND_COMPATIBILITY.get(frameworkId) ?? [])];
}

export function pickBackendRuntime(frameworkId: string, random = Math.random) {
  const runtimeIds = compatibleRuntimeIds(frameworkId);
  if (!runtimeIds.length) throw new Error(`Backend framework ${frameworkId} has no compatible runtime.`);
  return runtimeIds[randomIndex(runtimeIds.length, random)];
}

export function pickBackendPair(previousFrameworkId: string | null = null, random = Math.random): BackendPair {
  const frameworks = TECH_STACK.be;
  const candidates = frameworks.length > 1
    ? frameworks.filter(({ id }) => id !== previousFrameworkId)
    : frameworks;
  const frameworkId = candidates[randomIndex(candidates.length, random)].id;
  return { frameworkId, runtimeId: pickBackendRuntime(frameworkId, random) };
}

export function docsUrlFor(tech: Pick<Tech, 'name' | 'docsUrl'> | null | undefined, fallbackName = 'technology') {
  if (tech?.docsUrl) return tech.docsUrl;
  return `https://www.google.com/search?q=${encodeURIComponent(`${tech?.name ?? fallbackName} documentation`)}`;
}

export function describeStack(symbols: string[] = [], backendRuntime?: string | null): DescribedStackItem[] {
  return symbols.map((id, index) => {
    const layer = layerForReel(index);
    const tech = techById(layer, id);
    const name = tech?.name ?? id;
    const item: DescribedStackItem = {
      layer,
      layerLabel: LAYER_LABELS[layer],
      id,
      name,
      short: tech?.short ?? String(id).toUpperCase(),
      docsUrl: docsUrlFor(tech, name),
      iconUrl: tech?.iconUrl ?? `/devicons/${id}.svg`,
    };
    if (layer === 'be' && backendRuntime) {
      const runtime = technologyById(backendRuntime);
      if (runtime?.roles.includes('backend-runtime') && compatibleRuntimeIds(id).includes(runtime.id)) {
        item.runtime = {
          id: runtime.id,
          name: runtime.name,
          short: runtime.short,
          docsUrl: runtime.docsUrl,
          iconUrl: runtime.iconUrl,
        };
      }
    }
    return item;
  });
}
