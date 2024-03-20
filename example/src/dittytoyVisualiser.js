import {MSG_INIT, MSG_NOTE_PLAYED, MSG_UPDATE, MSG_WORKLET_READY} from "dittytoy";

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
        this.bpm = 0;
        this.tick = 0;
        this.sampleRate = 0;
        this.volume = 0.1;

        this.canvas = document.getElementById('visualiser');
        this.ctx = this.canvas.getContext('2d');

        this.dittytoy.addListener(MSG_INIT, ({structure}) => {
            // ditty is compiled and ready to play

            this.loops = {};
            this.bpm = structure.bpm;
            this.sampleRate = structure.sampleRate;
            this.tick = 0;

            const goldenAngle = Math.PI * (3 - Math.sqrt(5));

            structure.loops.forEach((loop, i) => {
                this.loops[loop.name] = {
                    color: `hsl(${60 + i * 240 / structure.loops.length}, 75%, 75%)`,
                    notes: [],
                    volume: 0.1,
                    rotSpeed: lerp(0.05, 0.2, Math.random()) * (Math.random() > 0.5 ? 1 : -1),
                    a: goldenAngle * i,
                    speedVariation: lerp(0.5, 1, Math.random()),
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
                if (data.amp.master) {
                    this.volume = lerp(this.volume, Math.sqrt(data.amp.master.volume), .01);
                }
                if (data.amp.loops) {
                    data.amp.loops.forEach(loop => {
                        if (this.loops[loop.name]) {
                            this.loops[loop.name].volume = lerp(this.loops[loop.name].volume, Math.sqrt(loop.volume), .01);
                        }
                    });
                }
            }
            if (data.state) {
                this.tick = data.state.tick;
            }
        });

        this.dittytoy.addListener(MSG_NOTE_PLAYED, data => {
            const loop = this.loops[data.loop];
            const angle = loop.a + step(this.tick) * loop.rotSpeed * 0.1 + data.note / 64 * Math.PI * 2;
            loop.notes.push({...data, volume: loop.volume ** 1.5, angle});
        });
    }

    update() {
        window.requestAnimationFrame(() => this.update());
        const canvas = this.canvas;
        const ctx = this.ctx;
        const {width, height} = canvas.getBoundingClientRect();

        if (canvas.width !== width | 0 || canvas.height !== height | 0) {
            canvas.width = width | 0;
            canvas.height = height | 0;
        }

        ctx.lineWidth = height / 300;

        // clear canvas
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const aspect = width / height;
        const t = (x, y) => [(x * .5 + .5 * aspect) * height, (y * .5 + .5) * height];

        this.drawInnerCircle(t, height);

        Object.values(this.loops).forEach(loop => loop.notes = this.drawLines(t, loop, aspect));

        this.drawAnalyser(t);
    }

    drawLines(t, loop, aspectRatio) {
        const filteredNotes = [];
        const speedModifier = 0.1 * loop.speedVariation;
        const ctx = this.ctx;
        ctx.strokeStyle = loop.color;

        loop.notes.forEach(note => {
            ctx.globalAlpha = 0.25 + 0.75 * note.volume;
            const end = Math.max(0.0001, (this.tick - note.tick)) * speedModifier;
            const start = Math.max(0.0001, (this.tick - note.tick - note.duration / 2)) * speedModifier;

            const r0 = innerCircleRadius * 2 + 2 * (end ** 0.9);
            const r1 = innerCircleRadius * 2 + 2 * (start ** 0.9);
            const a = note.angle; // loop.a + step(this.tick) * loop.rotSpeed * 0.1 + note.note / 64 * Math.PI * 2;

            ctx.beginPath();
            ctx.moveTo(...t(r0 * Math.sin(a), r0 * Math.cos(a)));
            ctx.lineTo(...t(r1 * Math.sin(a), r1 * Math.cos(a)));
            if (r1 < Math.max(1, aspectRatio)) {
                filteredNotes.push(note);
            }

            ctx.stroke();
        });
        ctx.globalAlpha = 1;
        return filteredNotes;
    }

    drawInnerCircle(t, height) {
        const ctx = this.ctx;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';

        const x = this.tick - Math.floor(this.tick);
        const x4 = this.tick / 4 - Math.floor(this.tick / 4);

        // create set of ripples, fading out over distance

        ctx.lineWidth *= .5;
        const count = 10;
        for (let i = 0; i < count; i++) {
            const opacity = 1 - (i + x4) / count;
            const radius = innerCircleRadius + (((i + x4) / count) ** 0.9) * 2;

            ctx.globalAlpha = .125 * opacity;
            ctx.beginPath();
            ctx.arc(...t(0, 0), radius * height / 2 - this.ctx.lineWidth, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.lineWidth *= 2;
        ctx.globalAlpha = 1;

        // const innerCircle
        const radius = lerp(smoothstep(0.5, 1, x) + smoothstep(0.5, 0, x), 1, 0.95) * innerCircleRadius;

        ctx.beginPath();
        ctx.arc(...t(0, 0), radius * height / 2 - this.ctx.lineWidth * 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawAnalyser(t) {
        this.freqAnalyser.getByteFrequencyData(this.freqData);

        const ctx = this.ctx;


        const ao = step(this.tick) * -0.1;

        for (let i = 8; i < this.freqData.length; i += 3) {
            const a = i * Math.PI * 2 / (this.freqData.length - 7) + ao;
            const r = innerCircleRadius + 0.2 * (Math.sqrt(this.freqData[i] / 255)) * this.volume;

            ctx.strokeStyle = `hsl(${60 + (i * 240 / (this.freqData.length - 7))}, 75%, 75%)`;

            ctx.beginPath();
            ctx.moveTo(...t(innerCircleRadius * Math.sin(a), innerCircleRadius * Math.cos(a)));
            ctx.lineTo(...t(Math.sin(a) * r, Math.cos(a) * r));
            ctx.stroke();
        }
    }
}