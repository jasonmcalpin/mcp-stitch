import { validateStitchApiConfig } from "../config/stitch.js";
import type { StitchConfig } from "../config/stitch.js";
import type { StitchCallResponse, StitchToolCall } from "../models/stitch.js";
import { toSafeErrorMessage } from "../utils/redact.js";

// Stitch transport contract:
// - HTTP POST to STITCH_API_BASE_URL, defaulting to https://stitch.googleapis.com/mcp
// - JSON-RPC envelope with method "tools/call"
// - params.name and params.arguments
// - API key sent via header "x-goog-api-key"

function shouldRetry(status?: number): boolean {
  if (!status) return true;
  return status === 408 || status === 429 || status >= 500;
}

function toStitchErrorText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;
  const errorObj = obj.error;

  if (errorObj && typeof errorObj === "object") {
    const e = errorObj as Record<string, unknown>;
    const message = e.message;
    if (typeof message === "string") return message;
  }

  return null;
}

function toToolContentError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const result = obj.result;
  if (!result || typeof result !== "object") return null;

  const resultObj = result as Record<string, unknown>;
  if (resultObj.isError !== true) return null;

  const content = resultObj.content;
  if (!Array.isArray(content) || content.length === 0) {
    return "Stitch tool returned isError=true.";
  }

  const first = content[0];
  if (first && typeof first === "object") {
    const text = (first as Record<string, unknown>).text;
    if (typeof text === "string" && text.trim().length > 0) {
      return text.trim();
    }
  }

  return "Stitch tool returned isError=true.";
}

export class StitchClient {
  private readonly config: StitchConfig;

  constructor(config: StitchConfig) {
    this.config = config;
  }

  async callTool(call: StitchToolCall): Promise<StitchCallResponse> {
    const configErrors = validateStitchApiConfig(this.config);
    const requestId = Date.now();

    if (configErrors.length > 0) {
      return {
        ok: false,
        error: configErrors.join(" "),
        requestId,
      };
    }

    const body = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: {
        name: call.toolName,
        arguments: call.input,
      },
    };

    let attempt = 0;
    let lastError = "Unknown Stitch API error.";
    let lastStatus: number | undefined;

    while (attempt <= this.config.maxRetries) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(this.config.baseUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.config.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        lastStatus = response.status;

        const text = await response.text();
        let payload: unknown = null;

        try {
          payload = text ? (JSON.parse(text) as unknown) : null;
        } catch {
          payload = { raw: text };
        }

        if (!response.ok) {
          const apiMessage = toStitchErrorText(payload);
          lastError = apiMessage ?? `Stitch API request failed with status ${response.status}.`;

          if (shouldRetry(response.status) && attempt < this.config.maxRetries) {
            attempt += 1;
            continue;
          }

          return {
            ok: false,
            error: lastError,
            requestId,
            status: response.status,
            details: payload,
          };
        }

        if (payload && typeof payload === "object") {
          const obj = payload as Record<string, unknown>;
          const apiMessage = toStitchErrorText(payload);
          const toolMessage = toToolContentError(payload);

          if (apiMessage) {
            return {
              ok: false,
              error: apiMessage,
              requestId,
              status: response.status,
              details: payload,
            };
          }

          if (toolMessage) {
            return {
              ok: false,
              error: toolMessage,
              requestId,
              status: response.status,
              details: payload,
            };
          }

          if ("result" in obj) {
            return {
              ok: true,
              data: obj.result,
              requestId,
              status: response.status,
            };
          }
        }

        return {
          ok: true,
          data: payload,
          requestId,
          status: response.status,
        };
      } catch (error) {
        clearTimeout(timeout);

        lastError = toSafeErrorMessage(error, [this.config.apiKey]);

        if (attempt < this.config.maxRetries) {
          attempt += 1;
          continue;
        }

        if (lastStatus === undefined) {
          return {
            ok: false,
            error: `Failed to call Stitch API: ${lastError}`,
            requestId,
          };
        }

        return {
          ok: false,
          error: `Failed to call Stitch API: ${lastError}`,
          requestId,
          status: lastStatus,
        };
      }
    }

    if (lastStatus === undefined) {
      return {
        ok: false,
        error: `Failed to call Stitch API: ${lastError}`,
        requestId,
      };
    }

    return {
      ok: false,
      error: `Failed to call Stitch API: ${lastError}`,
      requestId,
      status: lastStatus,
    };
  }
}
