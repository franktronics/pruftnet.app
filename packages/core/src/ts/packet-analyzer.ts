import { AnalysisResult, TestData } from '../types';
import addon from './addon';

/**
 * PacketAnalyzer class for analyzing network packets
 */
export class PacketAnalyzer {
  private nativeInstance: any;

  constructor() {
    this.nativeInstance = new addon.PacketAnalyzer();
  }

  /**
   * Analyze packet data for security threats and anomalies
   * @returns Analysis results
   */
  analyze(): AnalysisResult {
    return this.nativeInstance.analyze();
  }

  /**
   * Get test data for development purposes
   * @returns Test data object
   */
  getTestData(): TestData {
    return this.nativeInstance.getTestData();
  }
}