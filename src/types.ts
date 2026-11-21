// ============================================================
// SPECTRA-SWEEP — shared domain types
// ============================================================

export type Role = 'traveler' | 'auditor' | 'director';

export type ThemeKey = 'obsidian' | 'crimson' | 'daylight' | 'eco';

export type ViewMode = 'desktop' | 'mobile';

export type ModuleKey = 'optical' | 'ultrasonic' | 'emf' | 'footprint' | 'vault';

export type ThreatLevel = 'secure' | 'elevated' | 'critical';

export type SensorId = 'camera' | 'microphone' | 'magnetometer' | 'haptics';

export type SensorStatus = 'off' | 'active' | 'simulator' | 'restricted' | 'denied';

export interface SensorPermission {
  id: SensorId;
  status: SensorStatus;
  label: string;
  detail: string;
  gated: Role | null;
}

export interface ThreatEvent {
  id: string;
  kind: 'optical' | 'ultrasonic' | 'emf' | 'privacy';
  title: string;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  at: number;
  metric?: string;
  location?: string;
  source: 'sensor' | 'simulator' | 'audit';
}

export interface GlintCandidate {
  id: string;
  x: number;
  y: number;
  radius: number;
  intensity: number;
  luma: number;
  circularity: number;
  age: number;
  locked: boolean;
}

export interface OpticalScene {
  id: string;
  name: string;
  fixture: string;
  pinhole: { x: number; y: number; r: number } | null;
  threat: 'clean' | 'watch' | 'critical';
  note: string;
}

export type OpticalShader = 'redpass' | 'highpass' | 'negative' | 'strobe' | 'raw';

export interface UltrasonicPeak {
  hz: number;
  db: number;
  flagged: boolean;
  age: number;
}

export interface EmfReading {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  at: number;
}

export interface EmfPreset {
  id: string;
  label: string;
  note: string;
  target: number;
  severity: 'nominal' | 'watch' | 'critical';
}

export interface PrivacyFinding {
  id: string;
  label: string;
  value: string;
  risk: number; // 0-100
  exposed: boolean;
  remediation: string;
  detail: string;
}

export interface PrivacyReport {
  findings: PrivacyFinding[];
  score: number;
  gradedAt: number;
  stunLeak: boolean;
  hostCandidate: string | null;
  mdnsCandidate: string | null;
  publicCandidate: string | null;
}

export type ChecklistStatus = 'todo' | 'clear' | 'flag';

export interface ChecklistItem {
  id: string;
  index: number;
  title: string;
  zone: string;
  detail: string;
  module: ModuleKey;
  status: ChecklistStatus;
  note?: string;
}

export interface SweepRecord {
  id?: number;
  room: string;
  venue: string;
  createdAt: number;
  score: number;
  threatLevel: ThreatLevel;
  findings: number;
  checks: { id: string; title: string; status: ChecklistStatus; note?: string }[];
  events: ThreatEvent[];
  checklist: ChecklistItem[];
  snapshot?: string;
  synced: 0 | 1;
  pinHash?: string;
}

export interface SyncQueueItem {
  id?: number;
  recordId: number;
  payload: string;
  queuedAt: number;
  attempts: number;
  state: 'queued' | 'syncing' | 'done' | 'failed';
}

export interface ToastMsg {
  id: number;
  title: string;
  detail?: string;
  tone: 'ok' | 'warn' | 'danger' | 'info';
}

export type ModalKey =
  | null
  | { type: 'apk' }
  | { type: 'privileges' }
  | { type: 'forensic'; eventId: string }
  | { type: 'vault-unlock' }
  | { type: 'mirror-guide' }
  | { type: 'guide'; title: string; body: string };
