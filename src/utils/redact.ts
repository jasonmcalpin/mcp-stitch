export function redactSecrets(input: string, secrets: Array<string | undefined>): string {
  let output = input;

  for (const secret of secrets) {
    if (!secret) continue;
    output = output.split(secret).join("[REDACTED]");
  }

  return output;
}

export function toSafeErrorMessage(error: unknown, secrets: Array<string | undefined>): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactSecrets(raw, secrets);
}
