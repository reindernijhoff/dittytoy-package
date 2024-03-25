"use strict";

import workerCode from './ditty-worker.js?raw';
import workletCodeURL from './ditty-worklet.js?url';

function getWorkerURL(releaseMode) {
    const blob = new Blob([workerCode], {type: 'application/javascript'});
    return URL.createObjectURL(blob);
}

function getAudioWorkletURL() {
    return workletCodeURL;
}

export const LOOP_OPERATOR_SYNTH = 0;
export const LOOP_OPERATOR_OPTION = 1;

export const BUFFER_LENGTH = 128 * 5;
export const NUM_BUFFERS = 4;

export const RUN_AS_WORKER = 0;
export const RUN_AS_INLINE = 1;

export const NODE_TYPE_LOOP = 0;
export const NODE_TYPE_INLINE = 1;
export const NODE_TYPE_FILTER = 2;
export const NODE_TYPE_OUT = 3;

export const MSG_INIT = 0;
export const MSG_RESET = 1;
export const MSG_LOG = 2;
export const MSG_ERROR = 3;
export const MSG_ANALYZE_STRUCTURE = 4;
export const MSG_WORKLET_READY = 5;
export const MSG_UPDATE = 6;
export const MSG_NOTE_PLAYED = 7;
export const MSG_SET_AMP = 8;
export const MSG_SET_VARS = 9;
export const MSG_PLAY = 10;
export const MSG_STOP = 11;
export const MSG_PAUSE = 12;
export const MSG_RESUME = 13;


/*! unmute-ios-audio. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
const USER_ACTIVATION_EVENTS = [
    'auxclick',
    'click',
    'contextmenu',
    'dblclick',
    'keydown',
    'keyup',
    'mousedown',
    'mouseup',
    'touchend'
]

function unmuteIosAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    function isMobileSafari() {
        return navigator.userAgent.match(/(iPod|iPhone|iPad)/) && navigator.userAgent.match(/AppleWebKit/);
    }

    if (!isMobileSafari()) return new Promise((resolve, reject) => reject());

    // state can be 'blocked', 'pending', 'allowed'
    let htmlAudioState = 'blocked';
    let webAudioState = 'blocked';

    let audio;
    let context;
    let source;

    const sampleRate = (new AudioContext()).sampleRate;
    const silentAudioFile = createSilentAudioFile(sampleRate);

    // Return a seven samples long 8 bit mono WAVE file
    function createSilentAudioFile(sampleRate) {
        const arrayBuffer = new ArrayBuffer(10);
        const dataView = new DataView(arrayBuffer);

        dataView.setUint32(0, sampleRate, true);
        dataView.setUint32(4, sampleRate, true);
        dataView.setUint16(8, 1, true);

        const missingCharacters =
            window.btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
                .slice(0, 13);

        return `data:audio/wav;base64,UklGRisAAABXQVZFZm10IBAAAAABAAEA${missingCharacters}AgAZGF0YQcAAACAgICAgICAAAA=`;
    }

    function handleUserActivation(resolve, reject, e) {
        if (webAudioState === 'blocked') {
            webAudioState = 'pending'
            createWebAudio();
        }
        if (htmlAudioState === 'blocked') {
            htmlAudioState = 'pending'
            Promise.all([createHtmlAudio(), context.resume()])
                .then(() => resolve())
                .catch(err = reject(err));
        }
    }

    function createHtmlAudio() {
        audio = document.createElement('audio');

        audio.setAttribute('x-webkit-airplay', 'deny'); // Disable the iOS control center media widget
        audio.preload = 'auto';
        audio.loop = true;
        audio.src = silentAudioFile;
        audio.load();

        return audio.play().then(
            () => {
                htmlAudioState = 'allowed';
                maybeCleanup();
            },
            () => {
                htmlAudioState = 'blocked';

                audio.pause();
                audio.removeAttribute('src');
                audio.load();
                audio = null;
            }
        )
    }

    function createWebAudio() {
        context = new AudioContext();

        source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, 22050); // .045 msec of silence
        source.connect(context.destination);
        source.start();

        if (context.state === 'running') {
            webAudioState = 'allowed';
            maybeCleanup();
            return true;
        } else {
            webAudioState = 'blocked';

            source.disconnect(context.destination);
            source = null;

            context.close();
            context = null;
            return false;
        }
    }

    function maybeCleanup() {
        if (htmlAudioState !== 'allowed' || webAudioState !== 'allowed') return;

        USER_ACTIVATION_EVENTS.forEach(eventName => {
            window.removeEventListener(
                eventName, handleUserActivation, {capture: true, passive: true}
            );
        });
    }

    return new Promise((resolve, reject) => {
        USER_ACTIVATION_EVENTS.forEach(eventName => {
            window.addEventListener(
                eventName, handleUserActivation.bind(null, resolve, reject), {capture: true, passive: true}
            );
        });
    });
}

unmuteIosAudio().then(() => {
}).catch(() => {
});


class EventDispatcher {
    constructor() {
        this.events = {};
    }

    addListener(event, callback) {
        this.events[event]?.push(callback) || (this.events[event] = [callback]);
    }

    removeListener(event, callback) {
        this.events[event] = this.events[event]?.filter(listener => listener !== callback) || false;
    }

    dispatch(event, data) {
        this.events[event]?.forEach((listener) => listener(data));
        return this;
    }
}


export class Dittytoy extends EventDispatcher {
    constructor() {
        super();

        this._workerData = [];
        this._volumeWorkers = [];
        this._structure = {};

        this.paused = true;
        this.stopped = true;
    }

    postMessage(data, transfer = []) {
        this.postMessageToWorklet(data, transfer);
        this.postMessageToWorkers(data, transfer);
    }

    postMessageToWorklet(data, transfer = []) {
        if (this._worklet) {
            this._worklet.port.postMessage(data, transfer);
        }
    }

    postMessageToWorkers(data, transfer = []) {
        this._workerData.forEach(worker => worker.worker.postMessage(data, transfer));
    }

    postMessageToVolumeWorkers(data, transfer = []) {
        this.postMessageToWorklet(data, transfer);
        this._volumeWorkers.forEach(worker => worker.postMessage(data, transfer));
    }

    setVolume(amp) {
        this.postMessageToVolumeWorkers({type: MSG_SET_AMP, amp});
    }

    setInputParameters(vars) {
        this.postMessageToWorkers({type: MSG_SET_VARS, vars});
    }

    log(message, line = -1) {
        return this.dispatch(MSG_LOG, {message, line});
    }

    logClear() {
        return this.dispatch(MSG_RESET);
    }

    error(message, e) {
        return this.dispatch(MSG_ERROR, {message, ...e});
    }

    enableAudioVisualizer(context, source) {
        return this.dispatch(MSG_WORKLET_READY, {context, source});
    }

    onmessage(e) {
        return this.dispatch(e.data.type, e.data);
    }

    async stop() {
        if (!this.stopped) this.log('[STOP]');
        this.postMessageToWorklet({type: MSG_RESET});
        if (this._worklet) {
            await this._context.suspend();
        }
        this.paused = true;
        this.stopped = true;

        this.dispatch(MSG_STOP);
    }

    async pause() {
        this.log('[PAUSE]');
        if (!this.paused) {
            await this._context.suspend().then(() => {
                this.paused = true;
                this.dispatch(MSG_PAUSE);
            });
        }
    }

    async resume(vars, amp, releaseMode = false) {
        if (this.stopped) {
            await this.play(vars, amp, releaseMode);
        } else if (this.paused) {
            this.log('[RESUME]');
            this._context.resume().then(() => {
                this.paused = false;
                this.dispatch(MSG_RESUME);
            });
        }
    }

    terminateWorkers() {
        if (this._workerData.length > 0) this.log('[TERMINATE WORKERS]');
        this._workerData.forEach(workerData => workerData.worker.terminate());
        this._workerData = [];
        this._volumeWorkers = [];
    }

    setupWorkers(structure, code, vars = {}, amp = {}, releaseMode = true) {
        this.log('[CREATE WORKERS]');

        // find all workers

        const workers = [...structure.loops, ...structure.filters.filter(filter => filter.runAs === RUN_AS_WORKER)];

        workers.forEach(data => {
            const workerData = {...data};

            // create a worker for each loop
            const worker = new Worker(getWorkerURL(releaseMode));

            worker.addEventListener('error', (e) => {
                this.error(e.message, this.formatErrorCode(e));
                this.stop().then(() => {
                    worker.terminate();
                });
            });

            worker.onmessage = (m) => {
                const type = m.data.type;

                if (type === MSG_ERROR) {
                    this.error(m.data.message, this.formatErrorCode(m.data));
                    this.stop().then(() => {
                        worker.terminate();
                    });
                } else if (type !== MSG_INIT) {
                    this.onmessage(m);
                }
            };

            workerData.buffers = Array.from({length: NUM_BUFFERS}, (k, i) => ({
                data: new Float32Array(BUFFER_LENGTH * 2), index: i
            }));
            workerData.worker = worker;
            workerData.channel = new MessageChannel();

            this._workerData.push(workerData);
        });

        // initialize all workers
        this._workerData.forEach(data => {
            data.in = this._workerData.filter(w => w.out.nodeType === data.nodeType && w.out.name === data.name).map(n => ({
                name: n.name, nodeType: n.nodeType, port: n.channel.port2
            }));
            data.worker.postMessage({
                type: MSG_INIT,
                vars: vars,
                amp: amp,
                port: data.channel.port1,
                name: data.name,
                nodeType: data.nodeType,
                runAs: data.runAs,
                buffers: data.buffers,
                in: data.in,
                code,
            }, [data.channel.port1, ...data.buffers.map(b => b.data.buffer), ...data.in.map(i => i.port)]);
        });

        this._volumeWorkers = this._workerData.filter(w => w.in.length > 0 && w.in.filter(i => i.nodeType === NODE_TYPE_LOOP).length > 0).map(worker => worker.worker);
    }

    formatErrorCode(e) {
        const m = e.message;
        return {
            data: Object.assign(e, {
                success: false,
                toString: () => m + "\n" + Object.keys(e.e).map(
                    (a) => {
                        if (this[a] == null || typeof this[a] === "object") return;
                        return a + ": \t" + this[a]
                    }, e.e).filter(Boolean).join("\n")
            })
        };
    }

    async encodeMP3(vars = {}, amp = {}, duration, onProgress, onComplete, fadeIn = 0, fadeOut = 0, bitRate = 320) {
        await this.stop();
        this.terminateWorkers();

        this.log('[ENCODE MP3]');

        this.postMessageToWorklet({type: MSG_RESET});

        this.setupWorkers(this._structure, this._code, vars, amp);

        const mp3Worker = await new Worker(`js/ditty-mp3-export.js`);

        mp3Worker.onmessage = e => {
            if (e.data.cmd === 'end') {
                this.log("Done converting to mp3");
                onComplete(new Blob(e.data.buf, {type: 'audio/mp3'}));

                mp3Worker.terminate();

                this.stop();
                this.terminateWorkers();
            }
            if (e.data.cmd === 'progress') {
                onProgress(e.data.progress);
            }
        }

        const out = this._workerData.filter(workerData => workerData.out.nodeType === NODE_TYPE_OUT);
        mp3Worker.postMessage({
            type: MSG_INIT, in: out.map(w => ({name: w.name, nodeType: w.nodeType, port: w.channel.port2})
            ), state: this._structure, vars: vars, amp: amp,
            duration: duration, fadeIn: fadeIn, fadeOut: fadeOut, bitRate: bitRate
        }, out.map(w => w.channel.port2));
    }

    async compile(code) {
        await this.stop();
        this.terminateWorkers();

        this.logClear().log('Analyze code...', 0);

        return new Promise((resolve, reject) => {
            const worker = new Worker(getWorkerURL(false));

            worker.addEventListener('error', (e) => { // error while compiling code
                this.error(e.message, this.formatErrorCode(e));
                this.log('Unable to analyze code', 1);

                reject(this.formatErrorCode(e), worker);
                worker.terminate();
            });

            worker.addEventListener('message', (e) => {
                const structure = e.data.structure;

                if (Object.values(structure.loops).length <= 0) {
                    // add loop to code
                    structure.loops.push({
                        name: 'loop_0', nodeType: NODE_TYPE_LOOP, runAs: RUN_AS_WORKER, out: {nodeType: NODE_TYPE_OUT}
                    });
                    code = `loop(()=>{${code};\n},{name:'loop_0',sync:1e10});`;
                }
                this._structure = structure;
                this._code = code;

                this.onmessage(e);

                resolve(e);
                worker.terminate();
            });

            worker.postMessage({type: MSG_ANALYZE_STRUCTURE, code});
        });
    }

    async play(vars = [], amp = {}, releaseMode = false) {
        await this.stop();
        this.log('[PLAY]');

        this.postMessageToWorklet({type: MSG_RESET});

        if (!this._context) {
            const sampleRate = 44100;

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this._context = new AudioContext({sampleRate: sampleRate});

            this._source = new AudioBufferSourceNode(this._context);
            this._source.buffer = this._context.createBuffer(2, sampleRate, sampleRate);
            this._source.loop = true;

            await this._context.audioWorklet.addModule(getAudioWorkletURL());
            this._worklet = new AudioWorkletNode(this._context, `ditty-worklet`, {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2]
            });

            this._worklet.onerror = (e) => this.error(e.message, e);

            await this._source.start();
            this._source.connect(this._worklet).connect(this._context.destination);

            this._worklet.port.onmessage = (e) => {
                this.onmessage(e);
            };

            this.enableAudioVisualizer(this._context, this._worklet);
        }

        this.setupWorkers(this._structure, this._code, vars, amp, releaseMode);

        const out = this._workerData.filter(workerData => workerData.out.nodeType === NODE_TYPE_OUT);

        this.postMessageToWorklet({
            type: MSG_INIT, in: out.map(w => ({name: w.name, nodeType: w.nodeType, port: w.channel.port2})
            ), state: this._structure, vars: vars, amp: amp,
        }, out.map(w => w.channel.port2));


        if (this._context.state === 'suspended') {
            await this._context.resume().then(() => {
            }).catch((e) => this.error(e, e));
        } else {

        }

        this.paused = false;
        this.stopped = false;

        this.dispatch(MSG_PLAY);
    }
}
