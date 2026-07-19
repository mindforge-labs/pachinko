import { DEVICON_CATALOG, DEVICON_VERSION, type DeviconTech } from './generated/devicon-catalog';

export const TECHSTACK_SCHEMA_VERSION = 1 as const;
export const INSTALLED_DEVICON_VERSION = DEVICON_VERSION;

export const TECH_ROLES = [
  'frontend',
  'backend-framework',
  'backend-runtime',
  'database',
] as const;

export type TechRole = typeof TECH_ROLES[number];
export type TechSource =
  | { type: 'devicon'; sourceId: string }
  | { type: 'custom'; homepage: string };

export type MatrixTechnology = {
  id: string;
  name: string;
  short: string;
  docsUrl: string;
  iconUrl?: string;
  enabled: boolean;
  source: TechSource;
  roles: TechRole[];
};

export type FrameworkCompatibility = {
  frameworkId: string;
  runtimeIds: string[];
};

export type TechStackMatrix = {
  schemaVersion: number;
  source: { name: 'devicon'; version: string };
  technologies: MatrixTechnology[];
  compatibility: FrameworkCompatibility[];
};

export type MatrixIssue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  technologyId?: string;
};

export type MatrixValidation = {
  matrix: TechStackMatrix | null;
  errors: MatrixIssue[];
  warnings: MatrixIssue[];
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const roleSet = new Set<string>(TECH_ROLES);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isHttpsUrl = (value: unknown) => {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const isIconUrl = (value: unknown) => typeof value === 'string'
  && (isHttpsUrl(value) || (/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value) && !value.startsWith('//')));

export function validateTechStackMatrix(
  input: unknown,
  catalog: DeviconTech[] = DEVICON_CATALOG,
  installedDeviconVersion = INSTALLED_DEVICON_VERSION,
): MatrixValidation {
  const issues: MatrixIssue[] = [];
  const error = (code: string, message: string, technologyId?: string) => issues.push({ level: 'error', code, message, technologyId });
  const warning = (code: string, message: string, technologyId?: string) => issues.push({ level: 'warning', code, message, technologyId });

  if (!isRecord(input)) {
    error('malformed-matrix', 'Matrix must be a JSON object.');
    return splitIssues(null, issues);
  }
  if (input.schemaVersion !== TECHSTACK_SCHEMA_VERSION) {
    error('unsupported-schema', `Unsupported schemaVersion ${String(input.schemaVersion)}; expected ${TECHSTACK_SCHEMA_VERSION}.`);
  }
  if (!isRecord(input.source) || input.source.name !== 'devicon' || typeof input.source.version !== 'string' || !input.source.version) {
    error('invalid-source-metadata', 'source must identify a non-empty Devicon version.');
  } else if (input.source.version !== installedDeviconVersion) {
    warning('source-version-mismatch', `Matrix uses Devicon ${input.source.version}, but ${installedDeviconVersion} is installed.`);
  }
  if (!Array.isArray(input.technologies)) error('invalid-technologies', 'technologies must be an array.');
  if (!Array.isArray(input.compatibility)) error('invalid-compatibility', 'compatibility must be an array.');
  if (issues.some(({ code }) => ['unsupported-schema', 'invalid-source-metadata', 'invalid-technologies', 'invalid-compatibility'].includes(code))) {
    return splitIssues(null, issues);
  }

  const catalogIds = new Set(catalog.map(({ id }) => id));
  const ids = new Set<string>();
  const deviconSourceIds = new Set<string>();
  const technologies = input.technologies as unknown[];

  for (const [index, raw] of technologies.entries()) {
    if (!isRecord(raw)) {
      error('invalid-technology', `Technology at index ${index} must be an object.`);
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!ID_PATTERN.test(id)) error('invalid-id', `Technology id "${id}" is invalid.`, id || undefined);
    if (ids.has(id)) error('duplicate-id', `Duplicate technology id: ${id}.`, id);
    ids.add(id);
    if (typeof raw.name !== 'string' || !raw.name.trim()) error('invalid-name', `${id || `Technology ${index}`} needs a name.`, id);
    if (typeof raw.short !== 'string' || !raw.short.trim() || raw.short.length > 8) error('invalid-short', `${id || `Technology ${index}`} needs a short label of 1–8 characters.`, id);
    if (!isHttpsUrl(raw.docsUrl)) error('invalid-docs-url', `${id || `Technology ${index}`} needs an HTTPS documentation URL.`, id);
    if (typeof raw.enabled !== 'boolean') error('invalid-enabled', `${id || `Technology ${index}`} enabled must be boolean.`, id);
    if (!Array.isArray(raw.roles) || raw.roles.some((role) => typeof role !== 'string' || !roleSet.has(role))) {
      error('invalid-roles', `${id || `Technology ${index}`} has an invalid roles list.`, id);
    } else {
      if (new Set(raw.roles).size !== raw.roles.length) error('duplicate-role', `${id} has duplicate roles.`, id);
      if (raw.roles.length === 0) warning('unused-technology', `${id} is defined but has no roles.`, id);
    }

    if (!isRecord(raw.source) || (raw.source.type !== 'devicon' && raw.source.type !== 'custom')) {
      error('missing-source', `${id || `Technology ${index}`} needs Devicon or custom source attribution.`, id);
    } else if (raw.source.type === 'devicon') {
      if (typeof raw.source.sourceId !== 'string' || !catalogIds.has(raw.source.sourceId)) {
        error('missing-devicon-source', `${id} references missing Devicon source ${String(raw.source.sourceId)}.`, id);
      } else if (deviconSourceIds.has(raw.source.sourceId)) {
        error('duplicate-devicon-source', `Devicon source ${raw.source.sourceId} is assigned more than once; use multiple roles on one technology.`, id);
      } else {
        deviconSourceIds.add(raw.source.sourceId);
      }
      if (raw.iconUrl !== undefined) error('devicon-icon-override', `${id} cannot override its upstream Devicon icon URL.`, id);
    } else {
      if (!isHttpsUrl(raw.source.homepage)) error('invalid-custom-homepage', `${id} needs an HTTPS custom-source homepage.`, id);
      if (!isIconUrl(raw.iconUrl)) error('invalid-custom-icon', `${id} needs an HTTPS or root-relative icon URL.`, id);
      if (Array.isArray(raw.roles) && raw.roles.length === 0) error('custom-without-role', `${id} is custom and must have at least one role.`, id);
    }
  }

  const byId = new Map(technologies.filter(isRecord).map((tech) => [tech.id, tech] as const));
  const compatibility = input.compatibility as unknown[];
  const configuredFrameworks = new Set<string>();
  const usedRuntimes = new Set<string>();

  for (const [index, raw] of compatibility.entries()) {
    if (!isRecord(raw) || typeof raw.frameworkId !== 'string' || !Array.isArray(raw.runtimeIds)) {
      error('invalid-compatibility-edge', `Compatibility entry at index ${index} is malformed.`);
      continue;
    }
    const frameworkId = raw.frameworkId;
    if (configuredFrameworks.has(frameworkId)) error('duplicate-compatibility', `Compatibility for ${frameworkId} is defined more than once.`, frameworkId);
    configuredFrameworks.add(frameworkId);
    const framework = byId.get(frameworkId);
    if (!framework || framework.enabled !== true || !Array.isArray(framework.roles) || !framework.roles.includes('backend-framework')) {
      error('invalid-framework-edge', `Compatibility references missing, disabled, or non-framework technology ${frameworkId}.`, frameworkId);
    }
    if (raw.runtimeIds.length === 0) error('framework-without-runtime', `${frameworkId} has no compatible runtime.`, frameworkId);
    if (raw.runtimeIds.some((runtimeId) => typeof runtimeId !== 'string')) error('invalid-runtime-edge', `${frameworkId} has a non-string runtime id.`, frameworkId);
    if (new Set(raw.runtimeIds).size !== raw.runtimeIds.length) error('duplicate-runtime-edge', `${frameworkId} repeats a compatible runtime.`, frameworkId);
    for (const runtimeId of raw.runtimeIds.filter((value): value is string => typeof value === 'string')) {
      usedRuntimes.add(runtimeId);
      const runtime = byId.get(runtimeId);
      if (!runtime || runtime.enabled !== true || !Array.isArray(runtime.roles) || !runtime.roles.includes('backend-runtime')) {
        error('invalid-runtime-edge', `${frameworkId} references missing, disabled, or non-runtime technology ${runtimeId}.`, frameworkId);
      }
    }
  }

  for (const raw of technologies.filter(isRecord)) {
    if (raw.enabled !== true || !Array.isArray(raw.roles)) continue;
    const id = String(raw.id);
    if (raw.roles.includes('backend-framework') && !configuredFrameworks.has(id)) {
      error('framework-without-runtime', `${id} has no compatible runtime.`, id);
    }
    if (raw.roles.includes('backend-runtime') && !usedRuntimes.has(id)) {
      warning('unused-runtime', `${id} is not used by any backend framework.`, id);
    }
  }

  for (const role of TECH_ROLES) {
    const count = technologies.filter((raw) => isRecord(raw) && raw.enabled === true && Array.isArray(raw.roles) && raw.roles.includes(role)).length;
    if (count === 0) error('empty-role-pool', `The enabled ${role} pool is empty.`);
  }

  return splitIssues(issues.some(({ level }) => level === 'error') ? null : input as unknown as TechStackMatrix, issues);
}

function splitIssues(matrix: TechStackMatrix | null, issues: MatrixIssue[]): MatrixValidation {
  return {
    matrix,
    errors: issues.filter(({ level }) => level === 'error'),
    warnings: issues.filter(({ level }) => level === 'warning'),
  };
}

export function parseTechStackMatrixJson(
  json: string,
  catalog: DeviconTech[] = DEVICON_CATALOG,
  installedDeviconVersion = INSTALLED_DEVICON_VERSION,
): MatrixValidation {
  try {
    return validateTechStackMatrix(JSON.parse(json), catalog, installedDeviconVersion);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown JSON error';
    return splitIssues(null, [{ level: 'error', code: 'malformed-json', message: `Malformed JSON: ${message}` }]);
  }
}

const compare = (left: string, right: string) => left.localeCompare(right, 'en');

export function sortTechStackMatrix(matrix: TechStackMatrix): TechStackMatrix {
  const roleOrder = new Map(TECH_ROLES.map((role, index) => [role, index]));
  return {
    schemaVersion: matrix.schemaVersion,
    source: { name: 'devicon', version: matrix.source.version },
    technologies: matrix.technologies
      .map((tech) => ({
        id: tech.id,
        name: tech.name,
        short: tech.short,
        docsUrl: tech.docsUrl,
        ...(tech.iconUrl ? { iconUrl: tech.iconUrl } : {}),
        enabled: tech.enabled,
        source: tech.source.type === 'devicon'
          ? { type: 'devicon' as const, sourceId: tech.source.sourceId }
          : { type: 'custom' as const, homepage: tech.source.homepage },
        roles: [...tech.roles].sort((a, b) => (roleOrder.get(a) ?? 99) - (roleOrder.get(b) ?? 99)),
      }))
      .sort((a, b) => compare(a.id, b.id)),
    compatibility: matrix.compatibility
      .map((edge) => ({ frameworkId: edge.frameworkId, runtimeIds: [...edge.runtimeIds].sort(compare) }))
      .sort((a, b) => compare(a.frameworkId, b.frameworkId)),
  };
}

export function exportTechStackMatrix(matrix: TechStackMatrix) {
  const validation = validateTechStackMatrix(matrix);
  if (validation.errors.length) throw new Error(`Matrix export blocked: ${validation.errors.map(({ message }) => message).join(' ')}`);
  return `${JSON.stringify(sortTechStackMatrix(matrix), null, 2)}\n`;
}
