interface RpcErrorPayload {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  status?: number; // alcuni transport usano "status"
  code?: number;   // fallback
}

function parseMaybeJson(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const s = input.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return input;
  try {
    return JSON.parse(s);
  } catch {
    return input;
  }
}

export function coerceRpcError(e: any): { status: number; message: string; error?: string; raw: any } {
  // Possibile options: e, e.message, e.response, stringa JSON in e.message
  const candidates = [
    e?.response,
    e?.message,
    e,
  ]
    .map(parseMaybeJson)
    .filter((v) => v != null);

  // Trova il primo oggetto utile
  const obj =
    candidates.find((c) => typeof c === 'object' && !Array.isArray(c)) as RpcErrorPayload | undefined;

  let status: number = 500; // Default
  
  const statusCandidates = [
    obj?.statusCode,
    obj?.status,
    e?.statusCode,
    e?.status,
    obj?.code,
    e?.error?.statusCode
  ];
  
  // Find the first VALID numeric status code
  for (const candidate of statusCandidates) {
    if (typeof candidate === 'number' && candidate >= 100 && candidate <= 599) {
      status = candidate;
      break;
    }
  }
  

  // Messaggio: preferisci stringa, altrimenti unisci array
  let message: string | undefined;
  const m = obj?.message ?? e?.message ?? e?.response?.message ?? e?.error;
  if (Array.isArray(m)) {
    message = m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  } else if (typeof m === 'string') {
    message = m;
  } else if (m != null) {
    message = JSON.stringify(m);
  }

  // Additional fallbacks
  if (!message) {
    message =
      typeof e === 'string'
        ? e
        : typeof e?.toString === 'function'
          ? e.toString()
          : 'Internal server error';
  }

  // Campo "error" facoltativo, utile per coerenza body
  const error =
    typeof obj?.error === 'string'
      ? obj.error
      : typeof e?.error === 'string'
        ? e.error
        : undefined;

  return { status, message: message!, error, raw: obj ?? e };
}