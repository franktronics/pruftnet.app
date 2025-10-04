import { ScanResult, TestData } from '../types';
import addon from './addon';

/**
 * NetworkScanner class for scanning network hosts and ports
 */
export class NetworkScanner {
  private nativeInstance: any;

  constructor() {
    this.nativeInstance = new addon.NetworkScanner();
  }

  /**
   * Scan network targets for open ports and services
   * @param target Optional target to scan (for future use)
   * @returns Array of scan results
   */
  scan(target?: string): ScanResult[] {
    return this.nativeInstance.scan();
  }

  /**
   * Get test data for development purposes
   * @returns Test data object
   */
  getTestData(): TestData {
    return this.nativeInstance.getTestData();
  }
}