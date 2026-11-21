// ============================================================
// SPECTRA-SWEEP — global tactical store
// localStorage hydration for theme/role, live telemetry for
// threat-reactive theming, and toast dispatch.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  ChecklistItem,
  ModalKey,
  ModuleKey,
  Role,
  SensorPermission,
  ThemeKey,
  ThreatEvent,
  ThreatLevel,
  ToastMsg,
  ViewMode,
} from '../types';

export const CHECKLIST: ChecklistItem[] = [
  {
    id: 'c1',
    index: 1,
    title: 'Smoke detector dome & test button',
    zone: 'Ceiling',
    detail: 'Inspect the housing seam beside the test button for a 1–2 mm pinhole. Use the optical scanner with the smoke-detector fixture.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c2',
    index: 2,
    title: 'Air vent & HVAC grille',
    zone: 'Ceiling / Wall',
    detail: 'Shine a light through every louvre. A lens should show a concentric specular return; dust does not.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c3',
    index: 3,
    title: 'Bedside clock, radio & alarm',
    zone: 'Nightstand',
    detail: 'Look into the bezel between digits and the speaker grille. IR cameras hide behind smoked plastic.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c4',
    index: 4,
    title: 'USB wall chargers & outlets',
    zone: 'Wall',
    detail: 'Compare every outlet to the others — a mismatched plate or a charger not supplied by the host is a red flag.',
    module: 'emf',
    status: 'todo',
  },
  {
    id: 'c5',
    index: 5,
    title: 'Bathroom mirror nail test',
    zone: 'Bathroom',
    detail: 'Press a fingernail to the glass. A visible gap means standard second-surface glass; no gap means first-surface — inspect further.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c6',
    index: 6,
    title: 'Two-way mirror refraction check',
    zone: 'Bathroom',
    detail: 'Run the refraction calibrator: a spy mirror reflects ~100% with no depth offset for your fingertip reflection.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c7',
    index: 7,
    title: 'Wi-Fi router & network closet',
    zone: 'Utility',
    detail: 'Note the SSID and label. An undocumented second router or a cellular bridge is a strong indicator of a relay.',
    module: 'footprint',
    status: 'todo',
  },
  {
    id: 'c8',
    index: 8,
    title: 'TV & streaming box standby',
    zone: 'Living area',
    detail: 'Listen with the ultrasonic scanner at 25 cm. Smart TVs emit 18–20 kHz pairing tones in standby.',
    module: 'ultrasonic',
    status: 'todo',
  },
  {
    id: 'c9',
    index: 9,
    title: 'Picture frames & wall art',
    zone: 'Walls',
    detail: 'Sweep the frame back with the EMF meter — a powered transmitter shows 3–5× the 45 µT baseline.',
    module: 'emf',
    status: 'todo',
  },
  {
    id: 'c10',
    index: 10,
    title: 'Door peephole & latch',
    zone: 'Entry',
    detail: 'A reversed peephole or a lens taped behind it can watch the entry. Check both directions with the optical scanner.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c11',
    index: 11,
    title: 'Lamp shades, clocks & decor',
    zone: 'Bedroom',
    detail: 'Remove the shade and check the bulb base and cord junction for an inline camera module.',
    module: 'optical',
    status: 'todo',
  },
  {
    id: 'c12',
    index: 12,
    title: 'Network leak & fingerprint audit',
    zone: 'Digital',
    detail: 'Run the WebRTC leak test on the rental Wi-Fi before you log into anything personal.',
    module: 'footprint',
    status: 'todo',
  },
];

export interface AppState {
  booted: boolean;
  role: Role;
  theme: ThemeKey;
  view: ViewMode;
  module: ModuleKey;
  threatLevel: ThreatLevel;
  threatReason: string;
  events: ThreatEvent[];
  sensors: Record<string, SensorPermission>;
  checklist: ChecklistItem[];
  toasts: ToastMsg[];
  modal: ModalKey;
  vaultUnlocked: boolean;
  lowGpu: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  room: { name: string; venue: string };
  opticalThreat: number;
  ultrasonicThreat: number;
  emfThreat: number;
  privacyThreat: number;
}

type Action =
  | { type: 'boot'; role: Role; theme: ThemeKey; view: ViewMode }
  | { type: 'role'; role: Role }
  | { type: 'theme'; theme: ThemeKey }
  | { type: 'view'; view: ViewMode }
  | { type: 'module'; module: ModuleKey }
  | { type: 'sensor'; id: string; patch: Partial<SensorPermission> }
  | { type: 'sensorsAll'; status: SensorPermission['status'] }
  | { type: 'telemetry'; key: 'opticalThreat' | 'ultrasonicThreat' | 'emfThreat' | 'privacyThreat'; value: number }
  | { type: 'event'; event: ThreatEvent }
  | { type: 'clearEvents' }
  | { type: 'toast'; toast: Omit<ToastMsg, 'id'> }
  | { type: 'dismissToast'; id: number }
  | { type: 'modal'; modal: ModalKey }
  | { type: 'checklist'; id: string; status: ChecklistItem['status'] }
  | { type: 'checklistNote'; id: string; note: string }
  | { type: 'checklistReset' }
  | { type: 'checklistAll'; status: ChecklistItem['status'] }
  | { type: 'vaultUnlocked'; value: boolean }
  | { type: 'lowGpu'; value: boolean }
  | { type: 'prefs'; sound?: boolean; haptics?: boolean }
  | { type: 'room'; name?: string; venue?: string };

const defaultSensors: Record<string, SensorPermission> = {
  camera: {
    id: 'camera',
    status: 'off',
    label: 'Optical Glint Camera',
    detail: 'getUserMedia video · rear/front feed with screen-strobe illumination helper',
    gated: null,
  },
  microphone: {
    id: 'microphone',
    status: 'off',
    label: '48 kHz Ultrasonic DSP Mic',
    detail: 'Raw audio, AGC/NS/AEC disabled so 18–22 kHz survives the capture graph',
    gated: null,
  },
  magnetometer: {
    id: 'magnetometer',
    status: 'off',
    label: '3-Axis Magnetometer Array',
    detail: 'DeviceOrientation / Generic Sensor · µT flux in Bx, By, Bz',
    gated: null,
  },
  haptics: {
    id: 'haptics',
    status: 'active',
    label: 'Geiger Tactile Haptics',
    detail: 'navigator.vibrate / Capacitor Haptics · click cadence scales with flux',
    gated: null,
  },
};

function detectView(): ViewMode {
  if (typeof window === 'undefined') return 'desktop';
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'mobile') return 'mobile';
  if (params.get('view') === 'desktop') return 'desktop';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return coarse && window.innerWidth < 900 ? 'mobile' : 'desktop';
}

const initial: AppState = {
  booted: false,
  role: 'traveler',
  theme: 'obsidian',
  view: 'desktop',
  module: 'optical',
  threatLevel: 'secure',
  threatReason: 'All arrays nominal — no active threat signature',
  events: [],
  sensors: defaultSensors,
  checklist: CHECKLIST,
  toasts: [],
  modal: null,
  vaultUnlocked: false,
  lowGpu: false,
  soundEnabled: true,
  hapticsEnabled: true,
  room: { name: 'Suite 704', venue: 'Harborline Hotel' },
  opticalThreat: 0,
  ultrasonicThreat: 0,
  emfThreat: 0,
  privacyThreat: 0,
};

function deriveThreat(s: AppState): { level: ThreatLevel; reason: string } {
  const scores: [ThreatLevel, number, string][] = [
    ['critical', Math.max(s.opticalThreat, s.ultrasonicThreat, s.emfThreat, s.privacyThreat), ''],
  ];
  const critical =
    s.opticalThreat >= 62
      ? 'CRITICAL · Pinhole lens glint locked in optical field'
      : s.ultrasonicThreat >= 62
        ? 'CRITICAL · Active ultrasonic spy beacon transmitting >18 kHz'
        : s.emfThreat >= 62
          ? 'CRITICAL · Magnetic anomaly far above 45 µT baseline'
          : s.privacyThreat >= 70
            ? 'CRITICAL · Network identity leak detected by WebRTC probe'
            : null;
  if (critical) return { level: 'critical', reason: critical };
  void scores;

  const elevated =
    s.opticalThreat >= 24
      ? 'ELEVATED · Specular candidate under observation'
      : s.ultrasonicThreat >= 24
        ? 'ELEVATED · Near-ultrasonic activity in the 15–22.5 kHz band'
        : s.emfThreat >= 22
          ? 'ELEVATED · Flux excursion logged against baseline'
          : s.privacyThreat >= 40
            ? 'ELEVATED · Fingerprint entropy above hardening target'
            : null;
  if (elevated) return { level: 'elevated', reason: elevated };

  return { level: 'secure', reason: 'All arrays nominal — no active threat signature' };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'boot':
      return { ...state, booted: true, role: action.role, theme: action.theme, view: action.view };
    case 'role':
      return { ...state, role: action.role };
    case 'theme':
      return { ...state, theme: action.theme, lowGpu: action.theme === 'eco' };
    case 'view':
      return { ...state, view: action.view };
    case 'module':
      return { ...state, module: action.module };
    case 'sensor':
      return {
        ...state,
        sensors: {
          ...state.sensors,
          [action.id]: { ...state.sensors[action.id], ...action.patch },
        },
      };
    case 'sensorsAll':
      return {
        ...state,
        sensors: Object.fromEntries(
          Object.entries(state.sensors).map(([k, v]) => [k, { ...v, status: action.status }]),
        ),
      };
    case 'telemetry': {
      const next = { ...state, [action.key]: action.value };
      const { level, reason } = deriveThreat(next);
      return { ...next, threatLevel: level, threatReason: reason };
    }
    case 'event': {
      const events = [action.event, ...state.events].slice(0, 60);
      return { ...state, events };
    }
    case 'clearEvents':
      return { ...state, events: [] };
    case 'toast':
      return { ...state, toasts: [...state.toasts, { ...action.toast, id: Date.now() + Math.random() }] };
    case 'dismissToast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'modal':
      return { ...state, modal: action.modal };
    case 'checklist':
      return {
        ...state,
        checklist: state.checklist.map((c) =>
          c.id === action.id ? { ...c, status: action.status } : c,
        ),
      };
    case 'checklistNote':
      return {
        ...state,
        checklist: state.checklist.map((c) =>
          c.id === action.id ? { ...c, note: action.note } : c,
        ),
      };
    case 'checklistReset':
      return { ...state, checklist: state.checklist.map((c) => ({ ...c, status: 'todo', note: '' })) };
    case 'checklistAll':
      return { ...state, checklist: state.checklist.map((c) => ({ ...c, status: action.status })) };
    case 'vaultUnlocked':
      return { ...state, vaultUnlocked: action.value };
    case 'lowGpu':
      return { ...state, lowGpu: action.value };
    case 'prefs':
      return {
        ...state,
        soundEnabled: action.sound ?? state.soundEnabled,
        hapticsEnabled: action.haptics ?? state.hapticsEnabled,
      };
    case 'room':
      return {
        ...state,
        room: { name: action.name ?? state.room.name, venue: action.venue ?? state.room.venue },
      };
    default:
      return state;
  }
}

interface Ctx {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  toast: (t: Omit<ToastMsg, 'id'>) => void;
  logEvent: (e: Omit<ThreatEvent, 'id' | 'at'>) => ThreatEvent;
  can: (tier: Role) => boolean;
  setModule: (m: ModuleKey) => void;
}

const AppCtx = createContext<Ctx | null>(null);

const ROLE_RANK: Record<Role, number> = { traveler: 0, auditor: 1, director: 2 };

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const seq = useRef(0);
  const toastsRef = useRef(state.toasts);
  toastsRef.current = state.toasts;

  // hydrate prefs
  useEffect(() => {
    let role: Role = 'traveler';
    let theme: ThemeKey = 'obsidian';
    try {
      const r = localStorage.getItem('ss.role') as Role | null;
      const t = localStorage.getItem('ss.theme') as ThemeKey | null;
      if (r === 'traveler' || r === 'auditor' || r === 'director') role = r;
      if (t === 'obsidian' || t === 'crimson' || t === 'daylight' || t === 'eco') theme = t;
    } catch {
      /* storage blocked */
    }
    dispatch({ type: 'boot', role, theme, view: detectView() });
  }, []);

  // persist
  useEffect(() => {
    try {
      localStorage.setItem('ss.role', state.role);
      localStorage.setItem('ss.theme', state.theme);
    } catch {
      /* noop */
    }
    document.documentElement.dataset.theme = state.theme;
  }, [state.role, state.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('low-gpu', state.lowGpu || state.theme === 'eco');
  }, [state.lowGpu, state.theme]);

  // pointer + gyro specular tracking
  useEffect(() => {
    // Pointer tracking drives a CSS custom property on the document root rather
    // than React state: dozens of glass panels read it via `var(--px)` with zero
    // re-render cost per mousemove.
    let frame = 0;
    let lx = 50;
    let ly = 20;
    const flush = () => {
      frame = 0;
      const root = document.documentElement;
      root.style.setProperty('--px', `${lx}%`);
      root.style.setProperty('--py', `${ly}%`);
    };
    const onMove = (e: PointerEvent) => {
      lx = (e.clientX / window.innerWidth) * 100;
      ly = (e.clientY / window.innerHeight) * 100;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    // Gyroscope tilt drives the same two custom properties, remapped to a
    // virtual light position. Throttled to one write per animation frame.
    let tiltFrame = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (tiltFrame) return;
      tiltFrame = requestAnimationFrame(() => {
        tiltFrame = 0;
        const beta = e.beta ?? 0;
        const gamma = e.gamma ?? 0;
        const root = document.documentElement;
        root.style.setProperty('--px', `${50 + (gamma / 90) * 55}%`);
        root.style.setProperty('--py', `${50 + (beta / 90) * 40}%`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onOrient, true);
      if (frame) cancelAnimationFrame(frame);
      if (tiltFrame) cancelAnimationFrame(tiltFrame);
    };
  }, []);

  // auto-dismiss toasts
  useEffect(() => {
    if (!state.toasts.length) return;
    const t = setTimeout(() => {
      const oldest = toastsRef.current[0];
      if (oldest) dispatch({ type: 'dismissToast', id: oldest.id });
    }, 4600);
    return () => clearTimeout(t);
  }, [state.toasts]);

  const toast = useCallback((t: Omit<ToastMsg, 'id'>) => {
    dispatch({ type: 'toast', toast: t });
  }, []);

  const logEvent = useCallback((e: Omit<ThreatEvent, 'id' | 'at'>) => {
    const ev: ThreatEvent = {
      ...e,
      id: `EV-${Date.now().toString(36).toUpperCase()}-${(++seq.current).toString().padStart(2, '0')}`,
      at: Date.now(),
    };
    dispatch({ type: 'event', event: ev });
    return ev;
  }, []);

  const can = useCallback((tier: Role) => ROLE_RANK[state.role] >= ROLE_RANK[tier], [state.role]);

  const setModule = useCallback((m: ModuleKey) => dispatch({ type: 'module', module: m }), []);

  const value = useMemo(
    () => ({ state, dispatch, toast, logEvent, can, setModule }),
    [state, toast, logEvent, can, setModule],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export const ROLE_META: Record<
  Role,
  { name: string; tier: string; blurb: string; accent: string; unlocks: string[] }
> = {
  traveler: {
    name: 'SOLO TRAVELER',
    tier: 'Standard Tier',
    blurb: 'Full sweep capability for a single traveller checking into a rental.',
    accent: '#10B981',
    unlocks: [
      'Optical Glint Scanner (all 4 fixtures)',
      'Ultrasonic Beacon Detector',
      'EMF Bug Sweeper',
      '12-Point Hotel Safety Checklist',
    ],
  },
  auditor: {
    name: 'SECURITY AUDITOR',
    tier: 'Pro Tier',
    blurb: 'Professional room auditing with active counter-measures.',
    accent: '#06B6D4',
    unlocks: [
      'Active Ultrasonic Jammer (18–21.5 kHz curtain)',
      'Multi-Spectrum Optical Filters',
      'Two-Way Mirror Refraction Calibrator',
      'Evidence capture with checksum',
    ],
  },
  director: {
    name: 'COUNTER-INTEL DIRECTOR',
    tier: 'Admin Tier',
    blurb: 'Full forensic stack, evidence custody and telemetry export.',
    accent: '#8B5CF6',
    unlocks: [
      'WebRTC Leak Forensics Lab',
      'Raw Telemetry JSON Exporter',
      'PIN-Locked Evidence Vault',
      'IndexedDB Storage & Sync Controller',
    ],
  },
};
