import type { ThesisEvent, ThesisVersion } from "./types.js";

export interface ThesisStore {
  saveVersion(version: ThesisVersion): Promise<void>;
  getLatest(thesisId: string): Promise<ThesisVersion | null>;
  listVersions(thesisId: string): Promise<ThesisVersion[]>;
  appendEvent(event: ThesisEvent): Promise<void>;
  listEvents(thesisId: string): Promise<ThesisEvent[]>;
}

export class InMemoryThesisStore implements ThesisStore {
  private readonly versions = new Map<string, ThesisVersion[]>();
  private readonly events = new Map<string, ThesisEvent[]>();

  async saveVersion(version: ThesisVersion): Promise<void> {
    const current = this.versions.get(version.thesisId) ?? [];
    const withoutSameVersion = current.filter(
      (item) => item.version !== version.version,
    );
    withoutSameVersion.push(structuredClone(version));
    withoutSameVersion.sort((a, b) => a.version - b.version);
    this.versions.set(version.thesisId, withoutSameVersion);
  }

  async getLatest(thesisId: string): Promise<ThesisVersion | null> {
    const versions = this.versions.get(thesisId) ?? [];
    const latest = versions.at(-1);
    return latest ? structuredClone(latest) : null;
  }

  async listVersions(thesisId: string): Promise<ThesisVersion[]> {
    return structuredClone(this.versions.get(thesisId) ?? []);
  }

  async appendEvent(event: ThesisEvent): Promise<void> {
    const current = this.events.get(event.thesisId) ?? [];
    current.push(structuredClone(event));
    current.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    this.events.set(event.thesisId, current);
  }

  async listEvents(thesisId: string): Promise<ThesisEvent[]> {
    return structuredClone(this.events.get(thesisId) ?? []);
  }
}
