/**
 * The only door between modules. A module may import another module's
 * behaviour only through these contracts and its injection token; reaching
 * into src/modules/<other>/ internals fails CI (npm run deps:check).
 */
export * from './domain.types';
export * from './platform.contracts';
export * from './accounts.contract';
export * from './venues.contract';
export * from './conditions.contract';
export * from './contribution.contracts';
export * from './engagement.contracts';
export * from './adapters.contracts';
