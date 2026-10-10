export type ReportType = 'SALUTE' | 'SITREP' | '9-Line MEDEVAC'

export type ThreatLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type SystemStatus = 'STANDBY' | 'TRANSMITTING' | 'PROCESSING' | 'READ_BACK'

export interface SaluteData {
  size: string
  activity: string
  location: string
  unit: string
  time: string
  equipment: string
}

export interface SitrepData {
  unit_status: string
  location: string
  ammo_supply: string
  casualties: string
  operational_status: string
}

export interface MedevacData {
  line1_location: string
  line2_freq_callsign: string
  line3_patients_precedence: string
  line4_special_equipment: string
  line5_patient_type: string
  line6_security: string
  line7_marking: string
  line8_patient_nationality: string
  line9_cbrn: string
}

export type ReportPayload = 
  | { type: 'SALUTE'; data: SaluteData }
  | { type: 'SITREP'; data: SitrepData }
  | { type: '9-Line MEDEVAC'; data: MedevacData }

export interface TacticalReport {
  source?: 'demo' | 'api'
  id: string
  timestamp: string
  report_type: ReportType
  threat_level: ThreatLevel
  data: SaluteData | SitrepData | MedevacData
  raw_transcript: string
  read_back_text: string
  recommended_action: string
  confirmed: boolean
}
