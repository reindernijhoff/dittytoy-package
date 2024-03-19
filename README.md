# Dittytoy

The dittytoy package is a powerful package that allows you to compile and play ditties
from [Dittytoy.net](https://dittytoy.net), an online platform that allows you to create generative music using a
minimalistic javascript API.

The API syntax of Dittytoy is loosely based on the syntax of [Sonic Pi](https://sonic-pi.net/tutorial.html). You can find the
full [Dittytoy API Reference here](https://dittytoy.net/syntax).

## Getting started

### Installing

Add `dittytoy` to your project:

```sh
npm i dittytoy
```

## Basic usage

Compile a ditty and play.

```ts
import {Dittytoy} from 'dittytoy';

const dittytoy = new Dittytoy();

dittytoy.compile(`
ditty.bpm = 120;

loop( () => {

    for (let i=0; i<4; i++) {
        sine.play(c4, { attack: 0.01, release: 0.25,  duration: 0.125, pan: Math.random() * 2 - 1, amp: 1.0 });
        sleep( 0.25 );
    }

    sine.play(d4, { attack: 0.01, release: 0.25,  duration: 0.25 }); // attack and release in seconds, duration in ticks
    sleep(0.5); // sleep in ticks

    sine.play(f4, { attack: 0.01, release: 0.75,  duration: 0.25 });
    sleep(0.5);

}, { name: 'my first loop' });
`).then(() => {
  dittytoy.play();
})
```

Note: most browsers only allow audio to be played after a user interaction. You should use the `play` method to start the
audio after a user interaction.

### Controlling playback

You can control the playback of the ditty using the following methods:

```ts
dittytoy.play(); // start playing
dittytoy.pause(); // pause playing
dittytoy.stop(); // stop playing
dittytoy.resume(); // resume playing
```

### Events

Dittytoy emits events that you can listen to by subscribing to the `addEventListener` method.

```ts
dittytoy.addEventListener(MSG_PLAY, () => {
  console.log('Dittytoy starts playing');
});
```

Some of the events you can listen to are:

#### Logging

```ts
dittytoy.addEventListener(MSG_LOG, (data: any) => {
  console.log(data.message);
});

dittytoy.addEventListener(MSG_ERROR, (data: any) => {
  console.error(data.message);
});
```

#### Initialization

```ts
dittytoy.addEventListener(MSG_INIT, (data:any) => {
  console.log('Dittytoy is initialized, ready to play');
  console.log('Structure of compiled ditty:', data.structure);
});
```


#### Playback

```ts
dittytoy.addEventListener(MSG_NOTE_PLAYED, (data:any) => {
  console.log(`♪ tick: ${data.tick.toFixed(3)}, note: ${data.note} (${data.loop}.${data.synth})`);
});
dittytoy.addEventListener(MSG_UPDATE, (data:any) => {
  // data.amp contains information about the volume of the ditty and the separate loops
  const state = data.state;
  if (state) {
    console.log(`tick: ${(state.tick || 0).toFixed(3)}, time: ${(state.time || 0).toFixed(3)} (${state.bpm.toFixed(0)} bpm)`);
  }
});
```

#### Flow

```ts
dittytoy.addEventListener(MSG_PLAY, () => {
  console.log('play');
});
dittytoy.addEventListener(MSG_PAUSE, () => {
  console.log('pause');
});
dittytoy.addEventListener(MSG_STOP, () => {
  console.log('stop');
});
dittytoy.addEventListener(MSG_RESUME, () => {
  console.log('resume');
});
```

## Building

To build Dittytoy, ensure that you have [Git](http://git-scm.com/downloads)
and [Node.js](http://nodejs.org/) installed.

Clone a copy of the repo:

```sh
git clone https://github.com/reindernijhoff/dittytoy-package.git
```

Change to the dittytoy directory:

```sh
cd dittytoy-package
```

Install dev dependencies:

```sh
npm i
```

Build package:

```sh
npm run build
```
