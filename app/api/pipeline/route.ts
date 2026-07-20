import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import {
  GeminiProjectGenerationModel,
  PipelineOrchestrator,
  isPipelineError,
  loadCheckpoint,
  resolveGenerationMode,
  resolvePipelineWorkspaceBase,
} from '../../../src/pipeline';
import { parsePromptRequest } from '../../../src/prompt-request';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type PipelineBody = {
  mode?: unknown;
  action?: unknown;
  runId?: unknown;
  requirePlanApproval?: unknown;
  executeVerification?: unknown;
  projectName?: unknown;
  symbols?: unknown;
  backendRuntime?: unknown;
  authentication?: unknown;
};

function modelClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GeminiProjectGenerationModel({
    apiKey,
    model: process.env.GEMINI_MODEL,
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * Pipeline generation endpoint.
 *
 * Start:
 *   { mode: "pipeline", symbols, backendRuntime, authentication, requirePlanApproval?: boolean }
 *
 * Approve / reject a paused plan:
 *   { mode: "pipeline", action: "approve"|"reject", runId }
 */
export async function POST(request: Request) {
  let body: PipelineBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, 400);
  }

  const mode = resolveGenerationMode(process.env, body.mode);
  if (mode !== 'pipeline') {
    return jsonResponse({
      error: 'Pipeline mode is not enabled. Set mode to "pipeline" or GENERATION_MODE=pipeline.',
      mode,
      legacyEndpoint: '/api/gemini-guide',
    }, 400);
  }

  const model = modelClient();
  if (!model) {
    return jsonResponse(
      { error: 'Gemini API is not configured. Set GEMINI_API_KEY on the server.' },
      503,
    );
  }

  const workspaceBase = resolvePipelineWorkspaceBase();
  await mkdir(workspaceBase, { recursive: true });
  const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash';
  const action = typeof body.action === 'string' ? body.action : 'start';

  try {
    if (action === 'approve' || action === 'reject') {
      if (typeof body.runId !== 'string' || !body.runId.trim()) {
        return jsonResponse({ error: 'runId is required for approve/reject.' }, 400);
      }
      const runId = body.runId.trim();
      if (runId.includes('..') || runId.includes('/') || runId.includes('\\')) {
        return jsonResponse({ error: 'Invalid runId.' }, 400);
      }
      const workspaceRoot = path.resolve(workspaceBase, runId);
      const checkpoint = await loadCheckpoint(workspaceRoot);
      if (!checkpoint || checkpoint.stage !== 'awaiting_plan_approval') {
        return jsonResponse({
          error: 'No pipeline run is awaiting plan approval for this runId.',
          runId,
        }, 409);
      }

      const report = action === 'approve'
        ? await PipelineOrchestrator.approveFromCheckpoint(workspaceRoot, {
            model,
            mode: 'pipeline',
            executeVerification: body.executeVerification !== false,
          })
        : await PipelineOrchestrator.rejectFromCheckpoint(workspaceRoot, {
            model,
            mode: 'pipeline',
            executeVerification: false,
          }, 'Architecture plan rejected by user');

      const status = report.status === 'failed' ? (action === 'reject' ? 200 : 500) : 200;
      return jsonResponse({
        mode: 'pipeline',
        action,
        stage: report.runLog.stage,
        runId,
        workspaceRoot,
        report,
        model: modelName,
      }, status);
    }

    if (action !== 'start') {
      return jsonResponse({ error: `Unknown action "${action}". Use start, approve, or reject.` }, 400);
    }

    const parsed = parsePromptRequest(body);
    if (parsed.ok === false) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const requirePlanApproval = body.requirePlanApproval === true;
    const executeVerification = body.executeVerification === true;
    const orchestrator = new PipelineOrchestrator({
      model,
      workspaceBaseDir: workspaceBase,
      mode: 'pipeline',
      autoApprovePlan: !requirePlanApproval,
      executeVerification,
    });

    const report = await orchestrator.run({
      symbols: parsed.value.symbols,
      backendRuntime: parsed.value.backendRuntime,
      authentication: parsed.value.authentication,
      projectName: typeof body.projectName === 'string' ? body.projectName : undefined,
    });

    const httpStatus = report.status === 'stack_incompatible' ? 422
      : report.status === 'failed' ? 500
        : 200;

    return jsonResponse({
      mode: 'pipeline',
      action: 'start',
      stage: orchestrator.getStage(),
      runId: orchestrator.getRunId(),
      workspaceRoot: orchestrator.getWorkspaceRoot() ?? null,
      architecturePlan: orchestrator.getArchitecturePlan() ?? null,
      report,
      model: modelName,
    }, httpStatus);
  } catch (error) {
    if (isPipelineError(error)) {
      return jsonResponse({ error: error.message, code: error.code }, 400);
    }
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Pipeline request failed.',
    }, 500);
  }
}
