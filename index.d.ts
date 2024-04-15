export const LOOP_OPERATOR_SYNTH: 0;
export const LOOP_OPERATOR_OPTION: 1;
export const BUFFER_LENGTH: number;
export const NUM_BUFFERS: 4;
export const RUN_AS_WORKER: 0;
export const RUN_AS_INLINE: 1;
export const NODE_TYPE_LOOP: 0;
export const NODE_TYPE_INLINE: 1;
export const NODE_TYPE_FILTER: 2;
export const NODE_TYPE_OUT: 3;
export const MSG_INIT: 0;
export const MSG_RESET: 1;
export const MSG_LOG: 2;
export const MSG_ERROR: 3;
export const MSG_ANALYZE_STRUCTURE: 4;
export const MSG_WORKLET_READY: 5;
export const MSG_UPDATE: 6;
export const MSG_NOTE_PLAYED: 7;
export const MSG_SET_AMP: 8;
export const MSG_SET_VARS: 9;
export const MSG_PLAY: 10;
export const MSG_STOP: 11;
export const MSG_PAUSE: 12;
export const MSG_RESUME: 13;

export type VolumeType = {
  master?: {
    amp: number;
  },
  loops?: {
    name: string;
    amp: number;
  }
};

export type InputParameterType = {
  key: string;
  value: number;
}

export class Dittytoy {
  paused: boolean;
  stopped: boolean;

  addListener(event: any, callback: any): void;

  removeListener(event: any, callback: any): void;

  setVolume(volume: VolumeType): void;

  setInputParameters(inputParameters: InputParameterType[]): void;

  log(message: any, line?: number): this;

  error(message: any, e: any): this;

  compile(code: string): Promise<any>;

  stop(): Promise<void>;

  pause(): Promise<void>;

  resume(inputParameters?: InputParameterType[], volume?: VolumeType, releaseMode?: boolean): Promise<void>;

  play(inputParameters?: InputParameterType[], volume?: VolumeType, releaseMode?: boolean): Promise<void>;
}

export {};
