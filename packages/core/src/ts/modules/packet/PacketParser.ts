import { loadNative } from '../../internals/loadNative.js';

const native = loadNative();

export interface TestData {
  id: number;
  message: string;
  timestamp: number; // ms epoch
}

export class PacketParser {
  private _native: any;

  constructor() {
    this._native = new native.PacketParser();
  }

  getTestData(): TestData {
    return this._native.getTestData();
  }
}
