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

/**
 * The Dittytoy class represents a Dittytoy synthesizer.
 */
export class Dittytoy {
  /**
   * Indicates whether the synthesizer is paused.
   */
  paused: boolean;

  /**
   * Indicates whether the synthesizer is stopped.
   */
  stopped: boolean;

  /**
   * Adds a listener for a specific event.
   * @param event - The event to listen for.
   * @param callback - The function to call when the event occurs.
   */
  addListener(event: any, callback: any): void;

  /**
   * Removes a listener for a specific event.
   * @param event - The event to stop listening for.
   * @param callback - The function to remove from the event's listeners.
   */
  removeListener(event: any, callback: any): void;

  /**
   * Sets the volume for the synthesizer.
   * @param volume - The volume settings to apply.
   */
  setVolume(volume: VolumeType): void;

  /**
   * Sets the input parameters for the synthesizer.
   * @param inputParameters - The input parameters to set.
   */
  setInputParameters(inputParameters: InputParameterType[]): void;

  /**
   * Compiles the provided code.
   * @param code - The code to compile.
   * @returns A promise that resolves when the code has been compiled.
   */
  compile(code: string): Promise<any>;

  /**
   * Stops the synthesizer.
   * @returns A promise that resolves when the synthesizer has been stopped.
   */
  stop(): Promise<void>;

  /**
   * Pauses the synthesizer.
   * @returns A promise that resolves when the synthesizer has been paused.
   */
  pause(): Promise<void>;

  /**
   * Resumes the synthesizer.
   * @param inputParameters - The input parameters to set (optional).
   * @param volume - The volume settings to apply (optional).
   * @param releaseMode - Whether to enable release mode (optional).
   * @returns A promise that resolves when the synthesizer has been resumed.
   */
  resume(inputParameters?: InputParameterType[], volume?: VolumeType, releaseMode?: boolean): Promise<void>;

  /**
   * Starts playing the synthesizer.
   * @param inputParameters - The input parameters to set (optional).
   * @param volume - The volume settings to apply (optional).
   * @param releaseMode - Whether to enable release mode (optional).
   * @returns A promise that resolves when the synthesizer has started playing.
   */
  play(inputParameters?: InputParameterType[], volume?: VolumeType, releaseMode?: boolean): Promise<void>;
}
export {};
