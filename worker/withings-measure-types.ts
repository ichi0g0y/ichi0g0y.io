export type WithingsMeasureTypeMeta = {
  key: string
  labelJa: string
  labelEn: string
  unit: string | null
}

const KNOWN_WITHINGS_MEASURE_TYPES: Record<number, WithingsMeasureTypeMeta> = {
  1: { key: 'weight', labelJa: '体重', labelEn: 'Weight', unit: 'kg' },
  4: { key: 'height', labelJa: '身長', labelEn: 'Height', unit: 'm' },
  5: { key: 'fat_free_mass', labelJa: '除脂肪体重', labelEn: 'Fat-Free Mass', unit: 'kg' },
  6: { key: 'fat_ratio', labelJa: '体脂肪率', labelEn: 'Fat Ratio', unit: '%' },
  8: { key: 'fat_mass_weight', labelJa: '脂肪量', labelEn: 'Fat Mass', unit: 'kg' },
  9: { key: 'diastolic_blood_pressure', labelJa: '拡張期血圧', labelEn: 'Diastolic Blood Pressure', unit: 'mmHg' },
  10: { key: 'systolic_blood_pressure', labelJa: '収縮期血圧', labelEn: 'Systolic Blood Pressure', unit: 'mmHg' },
  11: { key: 'heart_pulse', labelJa: '心拍数', labelEn: 'Heart Pulse', unit: 'bpm' },
  12: { key: 'temperature', labelJa: '体温', labelEn: 'Temperature', unit: 'degC' },
  54: { key: 'spo2', labelJa: '血中酸素濃度', labelEn: 'SpO2', unit: '%' },
  71: { key: 'body_temperature', labelJa: '体温(推定)', labelEn: 'Body Temperature', unit: 'degC' },
  73: { key: 'skin_temperature', labelJa: '皮膚温', labelEn: 'Skin Temperature', unit: 'degC' },
  76: { key: 'muscle_mass', labelJa: '筋肉量', labelEn: 'Muscle Mass', unit: 'kg' },
  77: { key: 'hydration', labelJa: '体水分率', labelEn: 'Hydration', unit: '%' },
  88: { key: 'bone_mass', labelJa: '骨量', labelEn: 'Bone Mass', unit: 'kg' },
  91: { key: 'pulse_wave_velocity', labelJa: '脈波伝播速度', labelEn: 'Pulse Wave Velocity', unit: 'm/s' },
  123: { key: 'vo2_max', labelJa: '最大酸素摂取量', labelEn: 'VO2 Max', unit: 'ml/kg/min' },
  130: { key: 'atrial_fibrillation', labelJa: '心房細動', labelEn: 'Atrial Fibrillation', unit: null },
  135: { key: 'qrs_duration', labelJa: 'QRS間隔', labelEn: 'QRS Duration', unit: 'ms' },
  136: { key: 'pr_interval', labelJa: 'PR間隔', labelEn: 'PR Interval', unit: 'ms' },
  137: { key: 'qt_interval_corrected', labelJa: '補正QT間隔', labelEn: 'QT Interval Corrected', unit: 'ms' },
  138: { key: 'ventricular_rate', labelJa: '心室拍数', labelEn: 'Ventricular Rate', unit: 'bpm' },
  139: { key: 'atrial_rate', labelJa: '心房拍数', labelEn: 'Atrial Rate', unit: 'bpm' },
  155: { key: 'vascular_age', labelJa: '血管年齢', labelEn: 'Vascular Age', unit: 'years' },
  226: { key: 'night_heart_rate', labelJa: '夜間心拍数', labelEn: 'Night Heart Rate', unit: 'bpm' },
}

export const WITHINGS_PROJECTED_SUMMARY_TYPE_IDS = new Set<number>([1, 5, 6, 8])

export function getWithingsMeasureTypeMeta(typeId: number | null | undefined): WithingsMeasureTypeMeta {
  if (typeof typeId !== 'number' || !Number.isFinite(typeId)) {
    return {
      key: 'unknown',
      labelJa: '不明',
      labelEn: 'Unknown',
      unit: null,
    }
  }

  const known = KNOWN_WITHINGS_MEASURE_TYPES[typeId]
  if (known) {
    return known
  }

  return {
    key: `type_${typeId}`,
    labelJa: `タイプ ${typeId}`,
    labelEn: `Type ${typeId}`,
    unit: null,
  }
}
