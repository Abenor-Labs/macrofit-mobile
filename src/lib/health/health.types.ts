import type { WeightEntry, BodyMeasurement } from '@core/types'

export type HealthPermission = 'READ_WEIGHT' | 'READ_HEIGHT' | 'READ_BODY_FAT' | 'READ_STEPS'

export interface HealthRecordNormalized {
  weights: WeightEntry[]
  latestHeightCm?: number
  latestBodyFatPct?: number
  bodyFatMeasurements: BodyMeasurement[]
  totalRecordsFound: number
}

export interface HealthSyncResult {
  success: boolean
  data?: HealthRecordNormalized
  error?: string
  status?: 'not_installed' | 'not_supported' | 'permission_denied' | 'ok'
}
