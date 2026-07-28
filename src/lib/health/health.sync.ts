import { fetchHealthRecords } from './health-connect.client'
import type { HealthRecordNormalized, HealthSyncResult } from './health.types'
import type { WeightEntry, BodyMeasurement } from '@core/types'
import { lbsToKg } from '@core/utils/calculations'

export async function getHistoricalData(options: { daysBack?: number } = {}): Promise<HealthSyncResult> {
  const daysBack = options.daysBack ?? 365
  const endTime = new Date()
  const startTime = new Date()
  startTime.setDate(startTime.getDate() - daysBack)

  try {
    const [weightRecords, heightRecords, bodyFatRecords] = await Promise.all([
      fetchHealthRecords('Weight', startTime, endTime),
      fetchHealthRecords('Height', startTime, endTime),
      fetchHealthRecords('BodyFat', startTime, endTime),
    ])

    const weightByDate = new Map<string, WeightEntry>()
    for (const record of weightRecords) {
      if (!record.time) continue
      const dateStr = record.time.split('T')[0]
      const weightInKg = record.weight.inKilograms
      
      weightByDate.set(dateStr, {
        id: record.metadata?.id || `hc_weight_${dateStr}`,
        date: dateStr,
        weight: weightInKg,
        notes: 'Imported from Google Fit (Health Connect)',
      })
    }

    const weights = Array.from(weightByDate.values()).sort((a, b) => b.date.localeCompare(a.date))

    let latestHeightCm: number | undefined
    if (heightRecords.length > 0) {
      const sortedHeight = [...heightRecords].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      )
      const heightInMeters = sortedHeight[0].height.inMeters
      if (heightInMeters > 0) {
        latestHeightCm = Math.round(heightInMeters * 100)
      }
    }

    const bodyFatMeasurements: BodyMeasurement[] = []
    let latestBodyFatPct: number | undefined

    if (bodyFatRecords.length > 0) {
      const sortedFat = [...bodyFatRecords].sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      )
      latestBodyFatPct = sortedFat[0].percentage

      for (const record of bodyFatRecords) {
        if (!record.time) continue
        const dateStr = record.time.split('T')[0]
        bodyFatMeasurements.push({
          id: record.metadata?.id || `hc_fat_${dateStr}`,
          date: dateStr,
          notes: `Google Fit Body Fat: ${record.percentage}%`,
        })
      }
    }

    const totalRecordsFound = weights.length + (latestHeightCm ? 1 : 0) + bodyFatMeasurements.length

    const data: HealthRecordNormalized = {
      weights,
      latestHeightCm,
      latestBodyFatPct,
      bodyFatMeasurements,
      totalRecordsFound,
    }

    return {
      success: true,
      status: 'ok',
      data,
    }
  } catch (error) {
    console.error('Error fetching historical health data:', error)
    return {
      success: false,
      status: 'permission_denied',
      error: error instanceof Error ? error.message : 'Unknown health sync error',
    }
  }
}
