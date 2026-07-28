import { Platform, Linking } from 'react-native'
import {
  getSdkStatus,
  initialize,
  requestPermission,
  readRecords,
  SdkAvailabilityStatus,
} from 'react-native-health-connect'
import type { RecordType } from 'react-native-health-connect'

export const REQUIRED_PERMISSIONS = [
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'Height' },
  { accessType: 'read', recordType: 'BodyFat' },
  { accessType: 'read', recordType: 'Steps' },
] as const

export async function isHealthConnectAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  try {
    const status = await getSdkStatus()
    return status === SdkAvailabilityStatus.SDK_AVAILABLE
  } catch {
    return false
  }
}

export async function getHealthConnectStatus(): Promise<'available' | 'not_installed' | 'not_supported'> {
  if (Platform.OS !== 'android') return 'not_supported'
  try {
    const status = await getSdkStatus()
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return 'available'
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'not_installed'
    return 'not_supported'
  } catch {
    return 'not_supported'
  }
}

export async function openHealthConnectPlayStore(): Promise<void> {
  const url = 'market://details?id=com.google.android.apps.healthdata'
  const webUrl = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata'
  const canOpen = await Linking.canOpenURL(url)
  if (canOpen) {
    await Linking.openURL(url)
  } else {
    await Linking.openURL(webUrl)
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  try {
    const isInit = await initialize()
    if (!isInit) return false
    const granted = await requestPermission(REQUIRED_PERMISSIONS as unknown as Array<{ accessType: 'read' | 'write'; recordType: RecordType }>)
    return Array.isArray(granted) && granted.length > 0
  } catch (error) {
    console.error('Failed to request Health Connect permissions:', error)
    return false
  }
}

export async function fetchHealthRecords<T extends RecordType>(
  recordType: T,
  startTime: Date,
  endTime: Date
) {
  try {
    await initialize()
    const result = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
    })
    return result.records || []
  } catch (error) {
    console.error(`Error reading ${recordType} records:`, error)
    return []
  }
}
