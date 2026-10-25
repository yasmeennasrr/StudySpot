import { DeviceTokenEntity, SessionEntity, UserEntity } from './user.entities';
import {
  FavoriteEntity,
  ReviewEntity,
  ReviewReportEntity,
  UserPreferencesEntity,
  VenueEntity,
} from './venue.entities';
import {
  DynamicRecordEntity,
  PresenceRecordEntity,
  ReceiptCodeEntity,
  SurveyEntity,
  VenueApiKeyEntity,
} from './contribution.entities';
import { CouponEntity, CouponOfferEntity, PointsLedgerEntity } from './reward.entities';
import { AuditLogEntity, ConfigHistoryEntity, ConfigValueEntity } from './platform.entities';

export * from './user.entities';
export * from './venue.entities';
export * from './contribution.entities';
export * from './reward.entities';
export * from './platform.entities';

/** Every entity, registered once in the DataSource. Add new entities here. */
export const ALL_ENTITIES = [
  UserEntity,
  SessionEntity,
  DeviceTokenEntity,
  VenueEntity,
  ReviewEntity,
  ReviewReportEntity,
  UserPreferencesEntity,
  FavoriteEntity,
  SurveyEntity,
  DynamicRecordEntity,
  PresenceRecordEntity,
  ReceiptCodeEntity,
  VenueApiKeyEntity,
  CouponOfferEntity,
  CouponEntity,
  PointsLedgerEntity,
  AuditLogEntity,
  ConfigValueEntity,
  ConfigHistoryEntity,
];
