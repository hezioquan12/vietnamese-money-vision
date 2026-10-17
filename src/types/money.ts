/**
 * Money Vision - Type Definitions for Currency and Tactile UI
 * Compliant with Vietnamese Dong denominations (1k to 500k)
 */

export type MoneyClass =
  | 1000
  | 2000
  | 5000
  | 10000
  | 20000
  | 50000
  | 100000
  | 200000
  | 500000;

export const SUPPORTED_DENOMINATIONS: readonly MoneyClass[] = [
  1000,
  2000,
  5000,
  10000,
  20000,
  50000,
  100000,
  200000,
  500000,
] as const;

export const DENOMINATION_NAMES: Record<MoneyClass, string> = {
  1000: 'Một nghìn',
  2000: 'Hai nghìn',
  5000: 'Năm nghìn',
  10000: 'Mười nghìn',
  20000: 'Hai mươi nghìn',
  50000: 'Năm mươi nghìn',
  100000: 'Một trăm nghìn',
  200000: 'Hai trăm nghìn',
  500000: 'Năm trăm nghìn',
};

export interface DetectedMoneyItem {
  classId: MoneyClass;
  count: number;
  label: string;
  totalAmount: number;
}

export interface DetectionState {
  items: DetectedMoneyItem[];
  totalAmount: number;
  totalNotesCount: number;
  hasMoney: boolean;
  timestamp: number;
}

export interface SessionWalletState {
  totalAmount: number;
  totalNotesCount: number;
  history: DetectedMoneyItem[];
  lastUpdated: number;
}

export type GestureType =
  | 'SINGLE_TAP'
  | 'DOUBLE_TAP'
  | 'LONG_PRESS'
  | 'TWO_FINGER_DOUBLE_TAP';

export interface GestureEvent {
  type: GestureType;
  timestamp: number;
  description: string;
}
