export interface VersionRecord {
  versionId: string;
  algorithmName: string;
  version: number;
  parameters: Record<string, unknown>;
  createdAt: Date;
  description: string;
}

const versions: VersionRecord[] = [];
let nextId = 1;

export function registerVersion(
  algorithmName: string,
  parameters: Record<string, unknown>,
  description: string,
): VersionRecord {
  const record: VersionRecord = {
    versionId: `v${nextId++}`,
    algorithmName,
    version: versions.filter(v => v.algorithmName === algorithmName).length + 1,
    parameters,
    createdAt: new Date(),
    description,
  };
  versions.push(record);
  return record;
}

export function getLatestVersion(algorithmName: string): VersionRecord | null {
  const matches = versions.filter(v => v.algorithmName === algorithmName);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export function getVersionHistory(algorithmName: string): VersionRecord[] {
  return versions.filter(v => v.algorithmName === algorithmName);
}

export function compareVersions(v1: string, v2: string): number {
  return v1.localeCompare(v2, undefined, { numeric: true });
}
