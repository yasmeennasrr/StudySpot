/**
 * Platform contracts used by every module: time, configuration, audit.
 * Owner: M1. Providers: ClockModule, ConfigurationModule, AuditModule.
 */

// ---------------------------------------------------------------- IClock
export const CLOCK = Symbol('IClock');

/** Read time only through IClock so expiry tests can move it (SDS 9, testability). */
export interface IClock {
  now(): Date;
}

// ---------------------------------------------------------------- IConfig
export const CONFIG = Symbol('IConfig');

/**
 * Every tunable value (DATA-012, FR-039, FR-040, SDS 6.6). Stored in the
 * config_values table with history; defaults below apply until changed.
 */
export interface ConfigValues {
  'points.crowd': number;
  'points.noise': number;
  'points.wifi': number;
  'points.dailyCap': number;
  'freshness.crowdMinutes': number;
  'freshness.noiseMinutes': number;
  'freshness.wifiMinutes': number;
  'conditions.lastKnownMaxHours': number;
  'conditions.historicalDays': number;
  'conditions.historicalMinRecords': number;
  'conditions.cacheSeconds': number;
  'presence.venueRadiusMeters': number;
  'presence.locationValidMinutes': number;
  'presence.scanValidMinutes': number;
  'presence.rawRetentionHours': number;
  'presence.dwellMinutesForPrompt': number;
  'search.defaultRadiusMeters': number;
  'search.maxRadiusMeters': number;
  'search.maxResults': number;
}

export type ConfigKey = keyof ConfigValues;

export const CONFIG_DEFAULTS: ConfigValues = {
  'points.crowd': 10, // RWD-002
  'points.noise': 10,
  'points.wifi': 10,
  'points.dailyCap': 100, // RWD-016
  'freshness.crowdMinutes': 60, // RT-001
  'freshness.noiseMinutes': 60,
  'freshness.wifiMinutes': 360,
  'conditions.lastKnownMaxHours': 24, // RT-016
  'conditions.historicalDays': 90, // RT-017, PRIV-013
  'conditions.historicalMinRecords': 3, // SDS 6.6.3
  'conditions.cacheSeconds': 60, // RT-006
  'presence.venueRadiusMeters': 50, // RT-008
  'presence.locationValidMinutes': 15, // SDS 6.6.1
  'presence.scanValidMinutes': 10, // RT-008(b)
  'presence.rawRetentionHours': 2, // PRIV-016
  'presence.dwellMinutesForPrompt': 15, // SEN-014
  'search.defaultRadiusMeters': 2000, // SDS 6.6.4
  'search.maxRadiusMeters': 5000, // SDS 6.6.8
  'search.maxResults': 30,
};

/**
 * The settings an administrator may change in the Staff Console (PB-34, FR-039,
 * FR-040, UC-19). Every value is a whole number within [min, max]. Other keys stay
 * technical defaults that only a code change moves.
 */
export interface EditableSetting {
  key: ConfigKey;
  group: 'Rewards' | 'Freshness' | 'Presence';
  label: string;
  unit: string;
  min: number;
  max: number;
  requirement: string;
}

export const EDITABLE_SETTINGS: readonly EditableSetting[] = [
  {
    key: 'points.crowd',
    group: 'Rewards',
    label: 'Points for a crowd answer',
    unit: 'points',
    min: 0,
    max: 100,
    requirement: 'RWD-002',
  },
  {
    key: 'points.noise',
    group: 'Rewards',
    label: 'Points for a noise answer',
    unit: 'points',
    min: 0,
    max: 100,
    requirement: 'RWD-002',
  },
  {
    key: 'points.wifi',
    group: 'Rewards',
    label: 'Points for a Wi-Fi answer',
    unit: 'points',
    min: 0,
    max: 100,
    requirement: 'RWD-002',
  },
  {
    key: 'points.dailyCap',
    group: 'Rewards',
    label: 'Daily points cap per student',
    unit: 'points',
    min: 0,
    max: 1000,
    requirement: 'RWD-016',
  },
  {
    key: 'freshness.crowdMinutes',
    group: 'Freshness',
    label: 'Crowd counts as current for',
    unit: 'minutes',
    min: 5,
    max: 1440,
    requirement: 'RT-001',
  },
  {
    key: 'freshness.noiseMinutes',
    group: 'Freshness',
    label: 'Noise counts as current for',
    unit: 'minutes',
    min: 5,
    max: 1440,
    requirement: 'RT-001',
  },
  {
    key: 'freshness.wifiMinutes',
    group: 'Freshness',
    label: 'Wi-Fi counts as current for',
    unit: 'minutes',
    min: 5,
    max: 1440,
    requirement: 'RT-001',
  },
  {
    key: 'presence.venueRadiusMeters',
    group: 'Presence',
    label: 'Venue radius',
    unit: 'meters',
    min: 10,
    max: 500,
    requirement: 'FR-040, RT-008',
  },
];

/** One row of config_history (DATA-012). */
export interface ConfigChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

export interface IConfig {
  get<K extends ConfigKey>(key: K): Promise<ConfigValues[K]>;
  getAll(): Promise<ConfigValues>;
  /**
   * Staff only (FR-039, FR-040). Records who changed what and when (DATA-012).
   * Editable settings are checked against EDITABLE_SETTINGS and the daily cap must
   * be at least the largest per-category points value; a bad value is INVALID_INPUT.
   */
  set<K extends ConfigKey>(key: K, value: ConfigValues[K], changedByUserId: string): Promise<void>;
  /** Newest changes first (DATA-012). */
  history(filter: { key?: ConfigKey; limit?: number }): Promise<ConfigChange[]>;
}

// ---------------------------------------------------------------- IAudit
export const AUDIT = Symbol('IAudit');

export interface AuditEntry {
  actorType: 'user' | 'staff' | 'system' | 'anonymous';
  actorId?: string | null;
  action: string;
  target?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}

export interface AuditRecord extends AuditEntry {
  id: string;
  createdAt: string;
}

/** Security event log (SEC-010, FR-041, FR-044). */
export interface IAudit {
  record(entry: AuditEntry): Promise<void>;
  list(filter: { from?: Date; to?: Date; action?: string; limit?: number }): Promise<AuditRecord[]>;
}
