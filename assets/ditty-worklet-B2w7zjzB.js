"use strict";

const LOOP_OPERATOR_SYNTH = 0;
const LOOP_OPERATOR_OPTION = 1;

const BUFFER_LENGTH = 128 * 5;
const NUM_BUFFERS = 4;

const RUN_AS_WORKER = 0;
const RUN_AS_INLINE = 1;

const NODE_TYPE_LOOP = 0;
const NODE_TYPE_INLINE = 1;
const NODE_TYPE_FILTER = 2;
const NODE_TYPE_OUT = 3;

const MSG_INIT = 0;
const MSG_RESET = 1;
const MSG_LOG = 2;
const MSG_ERROR = 3;
const MSG_ANALYZE_STRUCTURE = 4;
const MSG_WORKLET_READY = 5;
const MSG_UPDATE = 6;
const MSG_NOTE_PLAYED = 7;
const MSG_SET_AMP = 8;
const MSG_SET_VARS = 9;
const MSG_PLAY = 10;
const MSG_STOP = 11;
const MSG_PAUSE = 12;
const MSG_RESUME = 13;

let ditty;

const hz_to_midi = hz => 12 * Math.log2(hz / 440) + 69;
const midi_to_hz = midi => (2 ** (midi / 12 - 5.75)) * 440;  // (midi - 69)/12
const tick_to_second = t => t * 60 / ditty.bpm;
const second_to_tick = t => t * ditty.bpm / 60;

const clamp = (t, min, max) => t < min ? min : t > max ? max : t;
const clamp01 = v => v > 1 ? 1 : v < 0 ? 0 : v;
const clampWave = v => v > 1 ? 1 : v < -1 ? -1 : v;
const lerp = (a, b, t) => a + t * (b - a);

const input = {};

const panleft = new Float32Array(1024);
const panright = new Float32Array(1024);

for (let i = 0; i < 1024; i++) {
    panleft[i] = Math.sin(Math.PI / 2 * (1 - i / 1024)) * 1.41421356237;
    panright[i] = Math.cos(Math.PI / 2 * (1 - i / 1024)) * 1.41421356237;
}

function filterPanAmp(input, pan, amp) {
    if (pan !== 0) {
        pan = (clampWave(pan) * 511 + 512 | 0) & 1023;
        input[0] *= panleft[pan];
        input[1] *= panright[pan];
    }
    if (amp !== 1) {
        input[0] *= amp;
        input[1] *= amp;
    }

    return input;
}

class Debug {
    constructor() {
        this.reset();
    }

    error(label, message = "") {
        this.messages[label] = {type: 'ERROR', label, message};
    }

    warn(label, message = "") {
        this.messages[label] = {type: 'WARN', label, message};
    }

    log(label, message = "") {
        this.messages[label] = {type: 'LIGHT', label, message};
    }

    probe(label, value = 0, amp = 1, duration = -1) { // negative value: show all data available
        if (!this.probes[label]) {
            this.probes[label] = {label, amp, duration, data: new Float32Array(BUFFER_LENGTH), samples: 0, time: 0};
        }
        const p = this.probes[label];
        if (p.time !== ditty.time) {
            p.data[p.samples % BUFFER_LENGTH] = value;
            p.samples++;
            p.time = ditty.time;
        }
    }

    get data() {
        return {
            messages: this.messages,
            probes: this.probes,
            input: Object.keys(this.messages).length !== 0 || Object.keys(this.probes).length !== 0
        }
    }

    reset() {
        this.messages = {};
        this.probes = {};
    }
}

const debug = new Debug();

class Ditty {
    constructor(bpm = 120, sampleRate = 44100) {
        this.time = 0;
        this.tick = 0;

        this.sampleRate = sampleRate;
        this.dt = 1 / this.sampleRate;
        this.dtick = 0;

        this.loops = {};
        this.filters = {};

        this.bpm = bpm;

        this.port = undefined;
    }

    reset() {
        this.time = 0;
        this.tick = 0;

        this.loops = {};
        this.filters = {};
    }

    get bpm() {
        return this._bpm;
    }

    set bpm(v) {
        this._bpm = v;
        this.dtick = this.bpm / (60 * this.sampleRate);
    }

    get invSampleRate() {
        return this.dt;
    }

    get structure() {
        return {
            bpm: this.bpm,
            sampleRate: this.sampleRate,
            loops: Object.values(this.loops).map(loop => loop.structure()),
            filters: Object.values(this.filters).map(filter => filter.structure()),
        };
    }

    addLoop(loop) {
        return this.loops[loop.name] = loop;
    }

    addFilter(filter) {
        return this.filters[filter.name] = filter;
    }

    log(str) {
        this.postMessage({type: MSG_LOG, message: str});
    }

    error(str) {
        this.postMessage({type: MSG_ERROR, message: str});
    }

    postMessage(object, transfer) {
        if (this.port) {
            this.port.postMessage(object, transfer);
        }
    }

    setVars(vars) {
        vars.forEach(kv => {
            input[kv.key] = parseFloat(kv.value);
        });
    }
}


class Audiobus {
    constructor() {
        this.reset();
    }

    initInput(data, onNewInput = () => {
    }, useMasterVolume = false) {
        this.reset();

        this.useMasterVolume = useMasterVolume;

        data.in.forEach(worker => {
            const workerData = {
                buffers: [],
                activeBuffer: undefined,
                port: worker.port,

                name: worker.name,
                volume: 0,
                volumeSqr: 0,
                amp: 0,
                targetAmp: 1,
            };

            this.input.set(worker.name, workerData);

            worker.port.onmessage = (e) => {
                workerData.buffers.push(e.data);
                this.started = this.started || this.checkIfEnoughBuffersAvailable();
                onNewInput();
            }
        });

        if (data.amp) {
            this.setAmp(data.amp);
        }

        return this;
    }

    checkIfEnoughBuffersAvailable() {
        for (const input of this.input.values()) {
            if (input.buffers.length <= 3) {
                return false;
            }
        }
        return true;
    }

    dataAvailable() {
        if (!this.started) {
            return false;
        }

        for (const input of this.input.values()) {
            const oldBuffers = [];

            oldBuffers.push(...input.buffers.filter(b => b.index < this._bufferCount));
            input.buffers = input.buffers.filter(b => b.index >= this._bufferCount);
            input.activeBuffer = input.buffers.find(b => b.index === this._bufferCount);

            if (oldBuffers.length > 0) {
                input.port.postMessage({type: 'data', buffers: oldBuffers}, oldBuffers.map(b => b.data.buffer));
            }

            if (!input.activeBuffer) {
                debug.error('Performance error', `${input.name} can't keep up.`);
                this.started = false;
                return false;
            }
        }

        return true;
    }

    reset() {
        this.started = false;
        this.input = new Map();
        this.counter = 0;

        this.master = {amp: 0, volume: 0, volumeSqr: 0, targetAmp: 1};
        this.useMasterVolume = false;

        this._bufferCount = 0;
    }

    fillBuffer(buffer) {
        if (!this.dataAvailable()) {
            return;
        }

        const master = this.master;

        for (let index = 0, l = buffer.length; index < l; index += 2) {
            const value = [0, 0];

            this.input.forEach(input => {
                input.amp += (input.targetAmp - input.amp) * 0.001;

                const input_0 = input.activeBuffer ? input.activeBuffer.data[index] * input.amp : 0;
                const input_1 = input.activeBuffer ? input.activeBuffer.data[index + 1] * input.amp : 0;

                input.volumeSqr += input_0 * input_0;
                input.volumeSqr += input_1 * input_1;

                value[0] += input_0;
                value[1] += input_1;
            });

            if (this.useMasterVolume) {
                master.amp += (master.targetAmp - master.amp) * 0.001;

                const v_0 = value[0] * master.amp;
                const v_1 = value[1] * master.amp;

                master.volumeSqr += v_0 * v_0;
                master.volumeSqr += v_1 * v_1;

                buffer[index] = .5 * v_0;
                buffer[index + 1] = .5 * v_1;
            } else {
                buffer[index] = value[0];
                buffer[index + 1] = value[1];
            }
        }

        this.input.forEach(input => {
            input.volume = Math.max(.9 * input.volume, Math.sqrt(input.volumeSqr / 512));
            input.volumeSqr = 0;
        });

        if (this.useMasterVolume) {
            this.master.volume = Math.max(.9 * this.master.volume, Math.sqrt(this.master.volumeSqr / 512));
            this.master.volumeSqr = 0;
        }

        this._bufferCount++;
    }

    get amp() {
        const data = {
            loops: [...this.input.values()].map(i => ({name: i.name, volume: i.volume})),
        }
        if (this.useMasterVolume) {
            data.master = {volume: this.master.volume};
        }
        return data;
    }

    setAmp(data) {
        if (data.loops) {
            data.loops.forEach(volData => {
                const loop = this.input.get(volData.name);
                if (loop) {
                    loop.targetAmp = parseFloat(volData.amp);
                }
            });
        }
        if (this.useMasterVolume && data.master) {
            this.master.targetAmp = data.master.amp;
        }
    }
}

ditty = new Ditty();

class DittyWorklet extends AudioWorkletProcessor {
    constructor() {
        super();

        ditty.port = this.port;

        this.audiobus = new Audiobus();
        this.buffer = new Float32Array(BUFFER_LENGTH * 2);
        this.counter = 0;
        this.reset();

        this.port.onmessage = (e) => {
            const data = e.data;

            switch (data.type) {
                case MSG_RESET:
                    ditty.reset();
                    this.audiobus.reset();
                    break;
                case MSG_INIT:
                    ditty.bpm = data.state.bpm;
                    this.audiobus.initInput(data, () => {
                    }, true);
                    this.audiobus.setAmp(data.amp);
                    break;
                case MSG_SET_AMP:
                    this.audiobus.setAmp(data.amp);
                    break;
            }
        };
    }

    reset() {
        this.buffer.fill(0);
        this.counter = 0;
    }

    process(inputs, outputs, parameters) {
        if (this.counter === 0) {
            if (this.audiobus.dataAvailable()) {
                this.audiobus.fillBuffer(this.buffer);
            } else {
                return true;
            }
        }

        const out = outputs[0];
        let index = this.counter * 2;

        for (let i = 0, l = out[0].length; i < l; i++) {
            out[0][i] = this.buffer[index++];
            out[1][i] = this.buffer[index++];
        }

        ditty.tick += ditty.dtick * out[0].length;
        ditty.time += ditty.dt * out[0].length;

        this.counter += out[0].length;

        if (this.counter >= BUFFER_LENGTH) {
            ditty.postMessage({
                type: MSG_UPDATE,
                amp: this.audiobus.amp,
                bpm: this.bpm, sampleRate: this.sampleRate, debug: debug.data,
                state: {
                    tick: ditty.tick,
                    time: ditty.time,
                    bpm: ditty.bpm
                },
            }, Object.values(debug.data.probes).map(p => p.data.buffer));
            debug.reset();
            this.counter = 0;
        }

        return true;
    }
}

registerProcessor('ditty-worklet', DittyWorklet);
