declare module 'react-day-picker' {
  export const DayPicker: any;
  export type DateRange = any;
  export default DayPicker;
}

declare module 'brainflow' {
  export interface BrainFlowInputParams {
    serial_port: string;
    mac_address: string;
    other_info: string;
    serial_number: string;
    ip_address: string;
    ip_port: number;
    ip_protocol: number;
    master_board_id: number;
    file: string;
    preshift: number;
    drift: number;
    decrement: number;
    timestamp_type: number;
  }
  export class BoardShim {
    constructor(boardId: number, params: BrainFlowInputParams);
    prepare_session(): Promise<void>;
    start_stream(bufferSize: number): Promise<void>;
    stop_stream(): Promise<void>;
    release_session(): Promise<void>;
    get_current_board_data(numSamples: number): Promise<number[][]>;
  }
  export const AggOperations: any;
  export const DataFilter: any;
  export const FilterTypes: any;
}

declare module 'vitest' {
  export const describe: any;
  export const test: any;
  export const expect: any;
  export const beforeEach: any;
  export const afterEach: any;
  export const vi: any;
  export const it: any;
}
