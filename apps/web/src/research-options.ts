type Environment = Record<string, string | undefined>;

export function researchOptions(env: Environment) {
  function integer(name: string, fallback: number, max: number) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > max
    )
      throw new Error(`${name} 必須是 1–${max} 的整數`);
    return value;
  }
  const researchLimit = integer("VITE_RESEARCH_LIMIT", 4, 30);
  const requestedTopK = integer("VITE_RESEARCH_TOP_K", 5, 20);
  // B raises researchLimit to at least topK. Cap topK to honor the cost limit.
  return {
    topK: Math.min(requestedTopK, researchLimit),
    researchLimit,
    concurrency: integer("VITE_RESEARCH_CONCURRENCY", 4, 4),
  };
}

export const RESEARCH_OPTIONS = researchOptions(import.meta.env);
