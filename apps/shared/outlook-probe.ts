export type OutlookPermissionMode = 'read' | 'full';
export type OutlookProbeStage = 'sign-in' | 'mailbox-read' | 'token-refresh' | 'refreshed-mailbox-read';

export interface OutlookProbeReport {
  version: 1;
  timestamp: string;
  permissionMode: OutlookPermissionMode;
  outcome: 'passed' | 'failed';
  checks: Array<{ stage: OutlookProbeStage; status: 'passed' | 'failed'; code?: string; guidance?: string }>;
  limits: string[];
}

export interface OutlookProbeInput { id: string; clientId: string; tenantId: string; mode: OutlookPermissionMode }
export interface OutlookProbeSnapshot {
  id: string; mode: OutlookPermissionMode;
  phase: 'preparing' | 'awaiting-sign-in' | 'running' | 'finished' | 'cancelled';
  checks: Array<{ stage: OutlookProbeStage; status: 'running' | 'passed' | 'failed'; code?: string; guidance?: string }>;
  report?: OutlookProbeReport;
}
export const outlookGuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
export const isOutlookGuid = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${outlookGuidPattern}$`).test(value);
