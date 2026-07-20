export const PIPELINE_ERROR_CODES = [
  'INVALID_PROJECT_SPEC',
  'STACK_INCOMPATIBLE',
  'MODEL_REQUEST_FAILED',
  'MODEL_RESPONSE_INVALID',
  'BATCH_SCOPE_VIOLATION',
  'UNSAFE_FILE_PATH',
  'FILE_WRITE_FAILED',
  'COMMAND_REJECTED',
  'COMMAND_TIMEOUT',
  'VERIFICATION_FAILED',
  'REPAIR_LIMIT_REACHED',
  'PIPELINE_CANCELLED',
  'INTERNAL_ERROR',
] as const;

export type PipelineErrorCode = (typeof PIPELINE_ERROR_CODES)[number];

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly details?: unknown;

  constructor(code: PipelineErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.details = details;
  }
}

export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}
