// Type definitions for the core network analysis package

export interface PacketData {
  data: Uint8Array;
  length: number;
  timestamp: number;
  source_interface: string;
}

export interface RawPacketData {
  source_ip?: string;
  dest_ip?: string;
  source_port?: number;
  dest_port?: number;
  protocol?: string;
  timestamp: number;
}

export interface ScanResult {
  target: string;
  is_alive: boolean;
  open_ports: number[];
  metadata: Record<string, string>;
}

export interface AnalysisResult {
  analysis_type: string;
  confidence: number;
  threat_level: string;
  protocol_anomalies: boolean;
  suspicious_patterns: string[];
}

export interface TestData {
  message: string;
  version: string;
  status: string;
}