'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DeviconTech } from '../../src/generated/devicon-catalog';
import {
  TECH_ROLES,
  TECHSTACK_SCHEMA_VERSION,
  exportTechStackMatrix,
  parseTechStackMatrixJson,
  validateTechStackMatrix,
  type MatrixTechnology,
  type TechRole,
  type TechStackMatrix,
} from '../../src/techstack-matrix';

const DRAFT_KEY = `pachinko-techstack-matrix-draft:v${TECHSTACK_SCHEMA_VERSION}`;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const titleize = (id: string) => id.replace(/js$/, '.js').replace(/(^|[-_])([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`);
const compatibilityCodes = new Set(['invalid-compatibility-edge', 'invalid-framework-edge', 'framework-without-runtime', 'invalid-runtime-edge', 'duplicate-runtime-edge', 'duplicate-compatibility']);

type Props = {
  committedMatrix: TechStackMatrix;
  catalog: DeviconTech[];
  installedDeviconVersion: string;
};

type Row = { sourceType: 'devicon' | 'custom'; sourceId: string; upstream?: DeviconTech; assignment?: MatrixTechnology };

export default function TechStackManager({ committedMatrix, catalog, installedDeviconVersion }: Props) {
  const [matrix, setMatrix] = useState(() => clone(committedMatrix));
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'devicon' | 'custom'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'unassigned' | 'compatibility-errors' | TechRole>('all');
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (!draft) return;
      const parsed = JSON.parse(draft) as Partial<TechStackMatrix>;
      if (parsed.schemaVersion === TECHSTACK_SCHEMA_VERSION && Array.isArray(parsed.technologies) && Array.isArray(parsed.compatibility)) {
        setMatrix(parsed as TechStackMatrix);
        setNotice('Restored the versioned browser draft.');
      }
    } catch {
      setNotice('The saved browser draft could not be restored.');
    }
  }, [catalog, installedDeviconVersion]);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(matrix)); } catch { /* Editing still works without storage. */ }
  }, [matrix]);

  const validation = useMemo(
    () => validateTechStackMatrix(matrix, catalog, installedDeviconVersion),
    [matrix, catalog, installedDeviconVersion],
  );
  const assignedBySource = useMemo(() => new Map(
    matrix.technologies
      .filter(({ source }) => source.type === 'devicon')
      .map((tech) => [(tech.source as { type: 'devicon'; sourceId: string }).sourceId, tech]),
  ), [matrix]);
  const rows = useMemo<Row[]>(() => [
    ...catalog.map((upstream) => ({ sourceType: 'devicon' as const, sourceId: upstream.id, upstream, assignment: assignedBySource.get(upstream.id) })),
    ...matrix.technologies.filter(({ source }) => source.type === 'custom').map((assignment) => ({ sourceType: 'custom' as const, sourceId: assignment.id, assignment })),
  ], [catalog, matrix, assignedBySource]);
  const compatibilityErrorIds = useMemo(() => new Set(
    validation.errors.filter(({ code }) => compatibilityCodes.has(code)).flatMap(({ technologyId }) => technologyId ? [technologyId] : []),
  ), [validation.errors]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const assignment = row.assignment;
      if (sourceFilter !== 'all' && row.sourceType !== sourceFilter) return false;
      if (roleFilter === 'unassigned' && assignment?.roles.length) return false;
      if (roleFilter === 'compatibility-errors' && !compatibilityErrorIds.has(assignment?.id ?? row.sourceId)) return false;
      if (TECH_ROLES.includes(roleFilter as TechRole) && !assignment?.roles.includes(roleFilter as TechRole)) return false;
      if (!query) return true;
      return [row.sourceId, assignment?.id, assignment?.name, row.upstream?.name, ...(row.upstream?.aliases ?? []), ...(row.upstream?.tags ?? [])]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [rows, search, sourceFilter, roleFilter, compatibilityErrorIds]);
  const runtimeEntries = matrix.technologies.filter(({ enabled, roles }) => enabled && roles.includes('backend-runtime'));

  const mutate = (change: (draft: TechStackMatrix) => void) => {
    setMatrix((current) => {
      const draft = clone(current);
      change(draft);
      return draft;
    });
    setExportText('');
  };

  const ensureDeviconAssignment = (source: DeviconTech) => {
    let assignment = matrix.technologies.find((tech) => tech.source.type === 'devicon' && tech.source.sourceId === source.id);
    if (assignment) return assignment.id;
    if (matrix.technologies.some(({ id }) => id === source.id)) {
      setNotice(`Cannot add Devicon ${source.id}: that product id is already used.`);
      return null;
    }
    mutate((draft) => {
      draft.technologies.push({
        id: source.id,
        name: titleize(source.id),
        short: source.id.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8),
        docsUrl: `https://devicon.dev/icons/${source.id}`,
        enabled: true,
        source: { type: 'devicon', sourceId: source.id },
        roles: [],
      });
    });
    return source.id;
  };

  const toggleRole = (row: Row, role: TechRole) => {
    const id = row.assignment?.id ?? (row.upstream ? ensureDeviconAssignment(row.upstream) : null);
    if (!id) return;
    mutate((draft) => {
      const tech = draft.technologies.find((item) => item.id === id);
      if (!tech) return;
      const removing = tech.roles.includes(role);
      tech.roles = removing ? tech.roles.filter((item) => item !== role) : [...tech.roles, role];
      if (removing && role === 'backend-framework') draft.compatibility = draft.compatibility.filter(({ frameworkId }) => frameworkId !== id);
      if (removing && role === 'backend-runtime') {
        draft.compatibility.forEach((edge) => { edge.runtimeIds = edge.runtimeIds.filter((runtimeId) => runtimeId !== id); });
      }
      if (!removing && role === 'backend-framework' && !draft.compatibility.some(({ frameworkId }) => frameworkId === id)) {
        draft.compatibility.push({ frameworkId: id, runtimeIds: [] });
      }
    });
  };

  const toggleRuntime = (frameworkId: string, runtimeId: string) => mutate((draft) => {
    let edge = draft.compatibility.find((item) => item.frameworkId === frameworkId);
    if (!edge) {
      edge = { frameworkId, runtimeIds: [] };
      draft.compatibility.push(edge);
    }
    edge.runtimeIds = edge.runtimeIds.includes(runtimeId)
      ? edge.runtimeIds.filter((id) => id !== runtimeId)
      : [...edge.runtimeIds, runtimeId];
  });

  const addCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const id = String(values.get('id') ?? '').trim();
    if (matrix.technologies.some((tech) => tech.id === id)) {
      setNotice(`Technology id ${id || '(empty)'} already exists.`);
      return;
    }
    mutate((draft) => draft.technologies.push({
      id,
      name: String(values.get('name') ?? '').trim(),
      short: String(values.get('short') ?? '').trim(),
      docsUrl: String(values.get('docsUrl') ?? '').trim(),
      iconUrl: String(values.get('iconUrl') ?? '').trim(),
      enabled: true,
      source: { type: 'custom', homepage: String(values.get('homepage') ?? '').trim() },
      roles: [String(values.get('role') ?? 'frontend') as TechRole],
    }));
    event.currentTarget.reset();
    setSourceFilter('custom');
    setNotice(`Added custom technology ${id || '(invalid id)'}; review validation before export.`);
  };

  const importMatrix = () => {
    const parsed = parseTechStackMatrixJson(importText, catalog, installedDeviconVersion);
    if (!parsed.matrix) {
      setNotice(`Import blocked: ${parsed.errors.map(({ message }) => message).join(' ')}`);
      return;
    }
    setMatrix(parsed.matrix);
    setExportText('');
    setNotice(`Imported matrix with ${parsed.warnings.length} warning(s).`);
  };

  const prepareExport = () => {
    if (validation.errors.length) {
      setNotice(`Export blocked by ${validation.errors.length} structural error(s).`);
      return;
    }
    try {
      const output = exportTechStackMatrix(matrix);
      setExportText(output);
      setNotice('Deterministic JSON is ready to review and commit.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Export failed.');
    }
  };

  const reset = () => {
    setMatrix(clone(committedMatrix));
    setImportText('');
    setExportText('');
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* no-op */ }
    setNotice('Reset to the committed matrix.');
  };

  const downloadExport = () => {
    if (!exportText) return;
    const url = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'techstack-matrix.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="matrix-manager">
      <header className="matrix-manager__header">
        <div>
          <p className="matrix-manager__eyebrow">Development tool · schema v{TECHSTACK_SCHEMA_VERSION}</p>
          <h1>Tech-stack matrix manager</h1>
          <p>Devicon {matrix.source.version} source · installed {installedDeviconVersion} · drafts stay in this browser.</p>
        </div>
        <a href="/">Back to reels</a>
      </header>

      <section className="matrix-manager__toolbar" aria-label="Catalog filters">
        <label>Search <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, id, alias, tag…" /></label>
        <label>Source <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as typeof sourceFilter)}><option value="all">All sources</option><option value="devicon">Devicon</option><option value="custom">Custom</option></select></label>
        <label>Assignment <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}><option value="all">All entries</option><option value="unassigned">Unassigned</option><option value="compatibility-errors">Compatibility errors</option>{TECH_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
        <span>{filteredRows.length} of {rows.length}</span>
      </section>

      <section className="matrix-manager__validation" aria-live="polite">
        <strong className={validation.errors.length ? 'is-error' : 'is-valid'}>{validation.errors.length ? `${validation.errors.length} export-blocking error(s)` : 'Structurally valid'}</strong>
        <span>{validation.warnings.length} warning(s)</span>
        {[...validation.errors, ...validation.warnings].map((issue, index) => <p key={`${issue.code}-${issue.technologyId}-${index}`} className={`matrix-issue matrix-issue--${issue.level}`}>{issue.level.toUpperCase()} · {issue.message}</p>)}
      </section>

      <section className="matrix-manager__catalog" aria-label="Technology catalog">
        {filteredRows.map((row) => {
          const tech = row.assignment;
          const compatibility = tech ? matrix.compatibility.find(({ frameworkId }) => frameworkId === tech.id) : undefined;
          return (
            <article className={`matrix-card${compatibilityErrorIds.has(tech?.id ?? '') ? ' has-error' : ''}`} key={`${row.sourceType}:${row.sourceId}`}>
              <div className="matrix-card__identity">
                <img src={row.upstream?.iconUrl ?? tech?.iconUrl} alt="" />
                <div><strong>{tech?.name ?? titleize(row.sourceId)}</strong><code>{tech?.id ?? row.sourceId}</code></div>
                <span className={`matrix-badge matrix-badge--${row.sourceType}`}>{row.sourceType === 'devicon' ? `Devicon: ${row.sourceId}` : 'Custom'}</span>
              </div>
              {row.upstream && <p className="matrix-card__upstream">Upstream {row.upstream.name} · {row.upstream.iconVariant} · {row.upstream.tags.slice(0, 5).join(', ') || 'no tags'}</p>}
              {tech?.source.type === 'custom' && <p className="matrix-card__upstream">Source: <a href={tech.source.homepage} target="_blank" rel="noreferrer">{tech.source.homepage}</a></p>}
              {tech?.source.type === 'custom' && (
                <div className="matrix-custom-editor">
                  {(['name', 'short', 'docsUrl', 'iconUrl'] as const).map((field) => <label key={field}>{field}<input value={tech[field] ?? ''} onChange={(event) => mutate((draft) => { const item = draft.technologies.find(({ id }) => id === tech.id); if (item) item[field] = event.target.value; })} /></label>)}
                  <label>homepage<input value={tech.source.homepage} onChange={(event) => mutate((draft) => { const item = draft.technologies.find(({ id }) => id === tech.id); if (item?.source.type === 'custom') item.source.homepage = event.target.value; })} /></label>
                  <button type="button" onClick={() => mutate((draft) => { draft.technologies = draft.technologies.filter(({ id }) => id !== tech.id); draft.compatibility = draft.compatibility.filter(({ frameworkId }) => frameworkId !== tech.id).map((edge) => ({ ...edge, runtimeIds: edge.runtimeIds.filter((id) => id !== tech.id) })); })}>Remove custom</button>
                </div>
              )}
              <div className="matrix-role-grid">
                {TECH_ROLES.map((role) => <label key={role}><input type="checkbox" checked={Boolean(tech?.roles.includes(role))} onChange={() => toggleRole(row, role)} />{role}</label>)}
                {tech && <label><input type="checkbox" checked={tech.enabled} onChange={() => mutate((draft) => { const item = draft.technologies.find(({ id }) => id === tech.id); if (item) item.enabled = !item.enabled; })} />enabled</label>}
              </div>
              {tech?.roles.includes('backend-framework') && (
                <fieldset className="matrix-runtime-picker"><legend>Compatible runtimes</legend>{runtimeEntries.map((runtime) => <label key={runtime.id}><input type="checkbox" checked={Boolean(compatibility?.runtimeIds.includes(runtime.id))} onChange={() => toggleRuntime(tech.id, runtime.id)} />{runtime.name} <code>{runtime.id}</code></label>)}</fieldset>
              )}
            </article>
          );
        })}
      </section>

      <section className="matrix-manager__panel">
        <h2>Add custom technology</h2>
        <form className="matrix-custom-form" onSubmit={addCustom}>
          <input name="id" placeholder="stable-id" required />
          <input name="name" placeholder="Display name" required />
          <input name="short" placeholder="SHORT" maxLength={8} required />
          <input name="docsUrl" type="url" placeholder="https://… docs" required />
          <input name="homepage" type="url" placeholder="https://… source homepage" required />
          <input name="iconUrl" placeholder="https://… or /custom.svg" required />
          <select name="role">{TECH_ROLES.map((role) => <option key={role}>{role}</option>)}</select>
          <button type="submit">Add custom</button>
        </form>
      </section>

      <section className="matrix-manager__io">
        <div className="matrix-manager__panel"><h2>JSON import</h2><textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste a complete matrix…" spellCheck={false} /><button type="button" onClick={importMatrix}>Validate and import</button></div>
        <div className="matrix-manager__panel"><h2>Deterministic export</h2><textarea value={exportText} readOnly placeholder="A valid export appears here…" spellCheck={false} /><div className="matrix-manager__actions"><button type="button" onClick={prepareExport} disabled={validation.errors.length > 0}>Validate and export</button><button type="button" onClick={() => exportText && navigator.clipboard?.writeText(exportText)}>Copy JSON</button><button type="button" onClick={downloadExport} disabled={!exportText}>Download JSON</button><button type="button" onClick={reset}>Reset committed</button></div></div>
      </section>
      <p className="matrix-manager__notice" role="status">{notice}</p>
    </main>
  );
}
