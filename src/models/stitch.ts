export type JsonObject = Record<string, unknown>;

export type StitchCallResult = {
  ok: true;
  data: unknown;
  requestId: number;
  status?: number;
};

export type StitchCallFailure = {
  ok: false;
  error: string;
  requestId: number;
  status?: number;
  details?: unknown;
};

export type StitchCallResponse = StitchCallResult | StitchCallFailure;

export type StitchToolCall = {
  toolName: string;
  input: JsonObject;
};
