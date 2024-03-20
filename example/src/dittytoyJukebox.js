import {Dittytoy, MSG_INIT, MSG_NOTE_PLAYED, MSG_UPDATE, RUN_AS_WORKER} from 'dittytoy';
import DittytoyVisualiser from "./dittytoyVisualiser.js";

function $(id) {
    return document.getElementById(id);
}

export default class DittytoyJukebox {
    constructor() {
        this.dittytoy = new Dittytoy();
        this.visualizer = new DittytoyVisualiser(this.dittytoy);
        this.ditty = null;
        this.paused = 2;

        this.fetchDitties();

        const dittyId = window.location.hash?.slice(1) || '24373308b4';
        this.fetchDitty(dittyId);

        $('play-button').addEventListener('click', async () => {
            if (this.paused === 0) {
                await this.pause();
            } else if (this.paused === 1) {
                await this.resume();
            } else {
                await this.play();
            }
            this.updateUI()
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
    }

    updateUI() {
        const icon = document.querySelector('.play-button i');
        if (!this.paused) {
            icon.className = 'fas fa-pause';
        } else {
            icon.className = 'fas fa-play';
        }
    }

    async fetchDitty(id) {
        await this.dittytoy.stop();
        this.paused = 2;
        this.updateUI();

        this.ditty = await fetch(`https://dittytoy.net/api/v1/ditty/${id}/`).then(e => e.json()).then(ditty => {
            $('song-name').innerHTML = `<a href="https://dittytoy.net/ditty/${ditty.object_id}" target="_blank">${ditty.title}</a>`;
            $('artist-name').innerHTML = `By <a href="https://dittytoy.net/user/${ditty.user_id}" target="_blank">${ditty.user_id}</a>`;
            return ditty;
        });

        await this.dittytoy.compile(this.ditty.code);

        window.location.hash = `${id}`;
    }

    async pause() {
        this.paused = 1;
        this.updateUI();
        await this.dittytoy.pause();
    }

    async resume() {
        this.paused = 0;
        this.updateUI();
        await this.dittytoy.resume();
    }

    async play() {
        this.paused = 0;
        this.updateUI();
        await this.dittytoy.play();
    }

    async playDitty(id) {
        // fetch ditty if not already fetched
        if (!this.ditty || this.ditty.object_id !== id) {
            await this.fetchDitty(id);
        }
        await this.play();
    }

    async fetchDitties() {
        fetch('https://dittytoy.net/api/v1/ditty/browse/love/').then(e => e.json()).then(data => {
            const maxDitties = 40;
            const ul = $('ditties');

            for (let i = 0; i < Math.min(data.objects.length, maxDitties); i++) {
                const ditty = data.objects[i];
                ul.innerHTML += `<li data-id="${ditty.object_id}">${ditty.title} by ${ditty.user_id}</li>`;
            }
            document.querySelectorAll("#ditties li").forEach(item => {
                item.addEventListener('click', event => {
                    document.querySelectorAll("#ditties li").forEach(el => {
                        el.classList.remove("selected");
                    });
                    event.target.classList.add("selected");
                    this.playDitty(event.target.getAttribute('data-id'));
                });
            });
        });
    }
}