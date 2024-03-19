import {MSG_INIT, MSG_UPDATE, MSG_WORKLET_READY} from "dittytoy";

const innerCircleRadius = 0.15;

function smootherstep01(x) {
    x = Math.max(0, Math.min(1, x)); // Clamp x to the range [0, 1]
    return x * x * x * (x * (x * 6 - 15) + 10);
}

function smoothstep(a, b, t) {
    // Clamp t to range [0, 1]
    t = Math.max(0, Math.min(1, (t - a) / (b - a)));

    return t * t * (3 - 2 * t);
}

function step(x) {
    const sw = 0.5;

    x += sw;

    const xi = Math.floor(x);
    const f = x - xi;

    return xi + smootherstep01(f / sw);
}

function lerp(a, b, t) {
    return a * (1 - t) + b * t;
}

export default class DittytoyVisualiser {
    constructor(dittytoy) {
        this.dittytoy = dittytoy;
        this.initialized = false;

        this.loops = {};
        this.bmp = 0;
        this.tick = 0;
        this.sampleRate = 0;
        this.volume = 0;

        this.canvas = document.getElementById('visualiser');
        this.ctx = this.canvas.getContext('2d');

        this.dittytoy.addListener(MSG_INIT, ({structure}) => {
            // ditty is compiled and ready to play

            this.loops = {};
            this.bmp = structure.bpm;
            this.sampleRate = structure.sampleRate;
            this.tick = 0;

            structure.loops.forEach(loop => {
                this.loops[loop.name] = {
                    color: 'white',
                    lines: [],
                    volume: 0,
                };
            });
        });

        this.dittytoy.addListener(MSG_WORKLET_READY, ({context, source}) => {
            const analyserFreq = context.createAnalyser();
            source.connect(analyserFreq);
            analyserFreq.fftSize = 512;
            this.freqAnalyser = analyserFreq;
            this.freqData = new Uint8Array(256);

            if (!this.initialized) this.update();
            this.initialized = true;
        });

        this.dittytoy.addListener(MSG_UPDATE, (data) => {
            if (data.amp) {
                this.volume = lerp(this.volume, Math.sqrt(data.amp.master.volume), .1);
            }
            if (data.state) {
                this.tick = data.state.tick;
            }
        });
    }

    update() {
        window.requestAnimationFrame(() => this.update());
        const canvas = this.canvas;
        const ctx = this.ctx;
        const {width, height} = canvas.getBoundingClientRect();

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.lineWidth = height / 300;

        // clear canvas
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const aspect = width / height;
        const t = (x, y) => [(x * .5 + .5 * aspect) * height, (y * .5 + .5) * height];

        this.drawInnerCircle(t, height);
        this.drawAnalyser(t);
    }

    drawInnerCircle(t, height) {
        const ctx = this.ctx;
        ctx.fillStyle = 'white';

        const x = this.tick - Math.floor(this.tick);
        const x4 = this.tick/4 - Math.floor(this.tick/4);

        // create set of ripples, fading out over distance

        ctx.lineWidth *= .5;
        const count = 10;
        for (let i=0; i<count; i++) {
            const opacity = 1 - (i+x4)/count;
            const radius = innerCircleRadius + Math.pow((i+x4)/count, .9) * 2;

            ctx.globalAlpha = .25 * opacity;
            ctx.beginPath();
            ctx.arc(...t(0,0), radius * height / 2  - this.ctx.lineWidth, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.lineWidth *= 2;
        ctx.globalAlpha = 1;

        // const innerCircle
        const radius = lerp(smoothstep(0.5, 1, x) + smoothstep(0.5, 0, x), 1, 0.95) * innerCircleRadius;

        ctx.beginPath();
        ctx.arc(...t(0,0), radius * height / 2  - this.ctx.lineWidth * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawAnalyser(t) {
        this.freqAnalyser.getByteFrequencyData(this.freqData);

        const ctx = this.ctx;
        ctx.strokeStyle = 'white';

        ctx.beginPath();

        const ao = step(this.tick) * -0.1;

        for (let i = 8; i < this.freqData.length; i += 3) {
            const a = i * Math.PI * 2 / (this.freqData.length - 7) + ao;
            const r = innerCircleRadius + 0.2 * (Math.sqrt(this.freqData[i] / 255)) * this.volume;
            ctx.moveTo(...t(innerCircleRadius * Math.sin(a), innerCircleRadius * Math.cos(a)));
            ctx.lineTo(...t(Math.sin(a) * r, Math.cos(a) * r));
        }

        ctx.stroke();
    }
}