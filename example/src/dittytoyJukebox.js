import {
    Dittytoy,
    MSG_INIT,
    MSG_NOTE_PLAYED,
    MSG_PAUSE,
    MSG_PLAY,
    MSG_RESUME,
    MSG_STOP,
    MSG_UPDATE,
    RUN_AS_WORKER
} from '../../src';
import DittytoyVisualiser from "./dittytoyVisualiser.js";
import {initDittytoyMediaSession, setMediaSessionMetadata} from "./dittytoyMediaSession.js";

function $(id) {
    return document.getElementById(id);
}

export default class DittytoyJukebox {
    constructor() {
        this.dittytoy = new Dittytoy();
        initDittytoyMediaSession(this.dittytoy, () => this.prev(), () => this.next());
        new DittytoyVisualiser(this.dittytoy);

        this.ditties = [];
        this.ditty = null;
        this.index = 0;

        this.fetchDitties().then(async () => {
            const dittyId = window.location.hash?.slice(1) || '24373308b4';
            await this.fetchDitty(dittyId);
        });

        $('play-button').addEventListener('click', async () => {
            if (this.dittytoy.paused) {
                await this.resume();
            } else {
                await this.pause();
            }
            this.updateUI();
        });

        this.dittytoy.addListener(MSG_INIT, data => {
            const loopCount = data.structure.loops.length;
            const filterCount = data.structure.filters.length;
            const workerCount = loopCount + data.structure.filters.filter(f => f.runAs === RUN_AS_WORKER).length;

            const pText = (i, str) => `${i} ${str}${i !== 1 ? 's' : ''}`;
            $('log1').innerText = `${pText(loopCount, 'loop')}, ${pText(filterCount, 'filter')} (${pText(workerCount, 'worker')}, 1 AudioWorklet)`;
        });

        this.dittytoy.addListener(MSG_UPDATE, ({state}) => {
            if (state) $('log2').innerText = `▸ tick: ${(state.tick || 0).toFixed(3)}, time: ${(state.time || 0).toFixed(3)} (${state.bpm.toFixed(0)} bpm)`;
        });
        this.dittytoy.addListener(MSG_NOTE_PLAYED, (data) => {
            $('log3').innerText = `♪ tick: ${data.tick.toFixed(3)}, note: ${data.note.toFixed(2)} (${data.loop}.${data.synth})`;
        });

        [MSG_PLAY, MSG_RESUME, MSG_PAUSE, MSG_STOP].forEach(type => {
            this.dittytoy.addListener(type, () => this.updateUI());
        });
    }

    updateUI() {
        const icon = document.querySelector('.play-button i');
        if (this.dittytoy.paused || this.dittytoy.stopped) {
            icon.className = 'fas fa-play';
        } else {
            icon.className = 'fas fa-pause';
        }
        if (this.ditty) {
            setMediaSessionMetadata({
                title: this.ditty.title,
                artist: this.ditty.user_id,
                album: 'Dittytoy',
                artwork: [
                    {
                        src: `https://dittytoy.net/thumbnail/${this.ditty.object_id}.webp`,
                        sizes: '512x512',
                        type: 'image/webp'
                    },
                ],
            });
        }
    }

    async fetchDitty(id) {
        await this.dittytoy.stop();
        this.updateUI();

        this.ditty = await fetch(`https://dittytoy.net/api/v1/ditty/${id}/`).then(e => e.json()).then(ditty => {
            $('song-name').innerHTML = `<a href="https://dittytoy.net/ditty/${ditty.object_id}" target="_blank">${ditty.title}</a>`;
            $('artist-name').innerHTML = `By <a href="https://dittytoy.net/user/${ditty.user_id}" target="_blank">${ditty.user_id}</a>`;
            return ditty;
        });

        await this.dittytoy.compile(this.ditty.code);

        this.index = this.ditties.findIndex(d => d === id) ?? -1;

        document.querySelectorAll("#ditties li").forEach(el => {
            el.classList.remove("selected");
        });
        document.querySelector(`#ditties li[data-id="${id}"]`)?.classList.add("selected");

        window.location.hash = `${id}`;
    }

    async pause() {
        await this.dittytoy.pause();
    }

    async resume() {
        await this.dittytoy.resume();
    }

    async play() {
        await this.dittytoy.play();
    }

    async playDitty(id) {
        // fetch ditty if not already fetched
        if (!this.ditty || this.ditty.object_id !== id) {
            await this.fetchDitty(id);
        }
        await this.play();
    }

    prev() {
        this.index = (this.index - 1 + this.ditties.length) % this.ditties.length;
        this.fetchDitty(this.ditties[this.index]).then(() => {
            this.play();
        });
    }

    next() {
        this.index = (this.index + 1) % this.ditties.length;
        this.fetchDitty(this.ditties[this.index]).then(() => {
            this.play();
        });
    }

    async fetchDitties() {
        return fetch('https://dittytoy.net/api/v1/ditty/browse/love/').then(e => e.json()).then(data => {
            const maxDitties = 40;
            const ul = $('ditties');

            for (let i = 0; i < Math.min(data.objects.length, maxDitties); i++) {
                const ditty = data.objects[i];
                ul.innerHTML += `<li data-id="${ditty.object_id}">${ditty.title} by ${ditty.user_id}</li>`;

                this.ditties[i] = ditty.object_id;
            }
            document.querySelectorAll("#ditties li").forEach(item => {
                item.addEventListener('click', event => {
                    this.playDitty(event.target.getAttribute('data-id'));
                });
            });
        });
    }
}