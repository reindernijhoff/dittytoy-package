import {MSG_PAUSE, MSG_PLAY, MSG_RESUME, MSG_STOP} from 'dittytoy';

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

function createAudioElement() {
    const audio = document.createElement('audio');

    audio.setAttribute('x-webkit-airplay', 'deny'); // Disable the iOS control center media widget
    audio.preload = 'auto';
    audio.loop = true;
    audio.src = createSilentAudioFile(44100);
    audio.load();
    return audio;
}

let audioElement = null;

export function initDittytoyMediaSession(dittytoy, prev = null, next = null) {
    if (!audioElement) {
        audioElement = createAudioElement();
        document.body.appendChild(audioElement);
    } else {
        return;
    }

    dittytoy.addListener(MSG_PLAY, () => {
        try {
            navigator.mediaSession.playbackState = "playing";
            audioElement.play();
        } catch (e) {
        }
    });
    dittytoy.addListener(MSG_RESUME, () => {
        try {
            navigator.mediaSession.playbackState = "playing";
            audioElement.play();
        } catch (e) {
        }
    });
    dittytoy.addListener(MSG_PAUSE, () => {
        try {
            navigator.mediaSession.playbackState = "paused";
            audioElement.pause();
        } catch (e) {
        }
    });
    dittytoy.addListener(MSG_STOP, () => {
        try {
            navigator.mediaSession.playbackState = "paused";
            audioElement.pause();
        } catch (e) {
        }
    });


    const actionHandlers = [
        ['play', async () => {
            await dittytoy.resume();
        }],
        ['pause', async () => {
            await dittytoy.pause();
        }],
        ['previoustrack', prev],
        ['nexttrack', next],
        ['stop', async () => {
            await dittytoy.pause();
        }],
    ];

    for (const [action, handler] of actionHandlers) {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
            console.log(`The media session action "${action}" is not supported yet.`);
        }
    }
}

export function setMediaSessionMetadata({title, artist, album, artwork}) {
    try {
    navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork: artwork.map(({src, sizes, type}) => ({src, sizes, type})),
    });
    } catch (error) {
        console.log(`The media session metadata is not supported yet.`);
    }
}