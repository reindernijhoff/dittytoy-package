# Dittytoy

Compile and play code (ditties) from [Dittytoy.net](https://dittytoy.net), an online platform that allows you to create generative music using a minimalistic javascript API. Zero dependencies.

The API syntax of Dittytoy is loosely based on the syntax of [Sonic Pi](https://sonic-pi.net/tutorial.html). You can find the
full [Dittytoy API Reference here](https://dittytoy.net/syntax).

## Demo

- [Canvas Audio Visualisation](https://reindernijhoff.github.io/dittytoy-package/).

This is a build from the repository's example/ directory. To start playback, press the play button at the top left of your screen.

## Getting started

### Installing

Add [dittytoy](https://www.npmjs.com/package/dittytoy) to your project:

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

Note: Most browsers only allow audio after a user interacts with it. You should use the `play` method to start the
audio after a user interaction.

## Controlling playback

You can control the playback of the ditty using the following methods:

```ts
dittytoy.play(); // start playing
dittytoy.pause(); // pause playing
dittytoy.stop(); // stop playing
dittytoy.resume(); // resume playing
```

### Change the volume

You can change the volume of the ditty using the `setVolume` method.

```ts
// set the volume to 50%
dittytoy.setVolume({master: {amp: 0.5}}); 
```

It is also possible to set the volume of two separate loops using the same method.

```ts
// set the volume of loop1 to 50% and loop2 to 75%
dittytoy.setVolume({loops: [{name: loop1, amp: 0.5}, {name: loop2, amp: 0.75}]});
```

### Set Input Parameters

Dittytoy allows you to set [input parameters](https://dittytoy.net/syntax#input-parameters) for the ditty using the `setInputParameters` method. For example, to set two parameters, `threshold` and `gain`, to -15 and 4, respectively, you can use the following code:

```ts
dittytoy.setInputParameters([{key: 'threshold', value: -15}, {key: 'gain', value: 4}]);
```

## Events

Dittytoy emits events you can listen to by subscribing to the `addListener` method. For example, to listen to the `MSG_PLAY` event, you can use the following code:

```ts
dittytoy.addListener(MSG_PLAY, () => {
  console.log('Dittytoy starts playing');
});
```

### Initialization

The `MSG_INIT` event is emitted when the ditty is compiled successfully and ready to play.

```ts
dittytoy.addListener(MSG_INIT, (data:any) => {
  console.log('Dittytoy is initialized, ready to play');
  console.log('Structure of compiled ditty:', data.structure);
});
```


### Playback

During playback, the `MSG_UPDATE` event is emitted each time the ditty is updated. This will be ~60 times per second.

```ts
dittytoy.addListener(MSG_UPDATE, (data:any) => {
  // data.amp contains information about the volume of the ditty and the separate loops
  const state = data.state;
  if (state) {
    console.log(`tick: ${(state.tick || 0).toFixed(3)}, time: ${(state.time || 0).toFixed(3)} (${state.bpm.toFixed(0)} bpm)`);
  }
});
```

Each time a note is played, the `MSG_NOTE_PLAYED` event is emitted.

```ts
dittytoy.addListener(MSG_NOTE_PLAYED, (data:any) => {
  console.log(`♪ tick: ${data.tick.toFixed(3)}, note: ${data.note} (${data.loop}.${data.synth})`);
});
```

### Logging

Different messages are emitted using the `MSG_LOG` and `MSG_ERROR` events.

```ts
dittytoy.addListener(MSG_LOG, (data: any) => {
  console.log(data.message);
});

dittytoy.addListener(MSG_ERROR, (data: any) => {
  console.error(data.message);
});
```

### Flow

Finally, the `MSG_PLAY`, `MSG_PAUSE`, `MSG_STOP`, and `MSG_RESUME` events are emitted when the ditty is played, paused, stopped, or resumed.

```ts
dittytoy.addListener(MSG_PLAY, () => {
  console.log('play');
});
dittytoy.addListener(MSG_PAUSE, () => {
  console.log('pause');
});
dittytoy.addListener(MSG_STOP, () => {
  console.log('stop');
});
dittytoy.addListener(MSG_RESUME, () => {
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
