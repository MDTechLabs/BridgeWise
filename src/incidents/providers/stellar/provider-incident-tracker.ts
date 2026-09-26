export interface Incident {
  id: string;
  provider: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
  affectedRoutes: string[];
}

const incidents: Incident[] = [];

export function reportIncident(incident: Omit<Incident, 'id'>): Incident {
  const newIncident: Incident = { id: crypto.randomUUID(), ...incident };
  incidents.push(newIncident);
  return newIncident;
}

export function resolveIncident(id: string): boolean {
  const incident = incidents.find(i => i.id === id);
  if (!incident || incident.resolvedAt) return false;
  incident.resolvedAt = new Date();
  return true;
}

export function getOpenIncidents(): Incident[] {
  return incidents.filter(i => !i.resolvedAt).sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
}

export function getIncidentsByProvider(provider: string): Incident[] {
  return incidents.filter(i => i.provider === provider);
}

export function getIncidentTimeline(provider: string): Incident[] {
  return getIncidentsByProvider(provider).sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
}

export function clearIncidents(): void {
  incidents.length = 0;
}
