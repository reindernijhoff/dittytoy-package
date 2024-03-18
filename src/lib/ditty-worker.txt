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

const notes = {
    cf0: 11, CF0: 11, Cf0: 11, cF0: 11, cb0: 11, CB0: 11, Cb0: 11, cB0: 11, c0: 12, C0: 12, cs0: 13, CS0: 13, cS0: 13,
    Cs0: 13, df0: 13, DF0: 13, Df0: 13, dF0: 13, db0: 13, DB0: 13, Db0: 13, dB0: 13, d0: 14, D0: 14, eb0: 15, EB0: 15,
    Eb0: 15, eB0: 15, ef0: 15, EF0: 15, Ef0: 15, eF0: 15, ds0: 15, DS0: 15, Ds0: 15, dS0: 15, e0: 16, E0: 16, fb0: 16,
    FB0: 16, Fb0: 16, fB0: 16, ff0: 16, FF0: 16, Ff0: 16, fF0: 16, f0: 17, F0: 17, es0: 17, ES0: 17, Es0: 17, eS0: 17,
    fs0: 18, FS0: 18, Fs0: 18, fS0: 18, gb0: 18, GB0: 18, Gb0: 18, gB0: 18, gf0: 18, GF0: 18, Gf0: 18, gF0: 18, g0: 19,
    G0: 19, gs0: 20, GS0: 20, Gs0: 20, gS0: 20, ab0: 20, AB0: 20, Ab0: 20, aB0: 20, af0: 20, AF0: 20, Af0: 20, aF0: 20,
    a0: 21, A0: 21, bb0: 22, BB0: 22, Bb0: 22, bB0: 22, bf0: 22, BF0: 22, Bf0: 22, bF0: 22, as0: 22, AS0: 22, As0: 22,
    aS0: 22, b0: 23, B0: 23, bs0: 24, BS0: 24, Bs0: 24, bS0: 24, cf1: 23, CF1: 23, Cf1: 23, cF1: 23, cb1: 23, CB1: 23,
    Cb1: 23, cB1: 23, c1: 24, C1: 24, cs1: 25, CS1: 25, cS1: 25, Cs1: 25, df1: 25, DF1: 25, Df1: 25, dF1: 25, db1: 25,
    DB1: 25, Db1: 25, dB1: 25, d1: 26, D1: 26, eb1: 27, EB1: 27, Eb1: 27, eB1: 27, ef1: 27, EF1: 27, Ef1: 27, eF1: 27,
    ds1: 27, DS1: 27, Ds1: 27, dS1: 27, e1: 28, E1: 28, fb1: 28, FB1: 28, Fb1: 28, fB1: 28, ff1: 28, FF1: 28, Ff1: 28,
    fF1: 28, f1: 29, F1: 29, es1: 29, ES1: 29, Es1: 29, eS1: 29, fs1: 30, FS1: 30, Fs1: 30, fS1: 30, gb1: 30, GB1: 30,
    Gb1: 30, gB1: 30, gf1: 30, GF1: 30, Gf1: 30, gF1: 30, g1: 31, G1: 31, gs1: 32, GS1: 32, Gs1: 32, gS1: 32, ab1: 32,
    AB1: 32, Ab1: 32, aB1: 32, af1: 32, AF1: 32, Af1: 32, aF1: 32, a1: 33, A1: 33, bb1: 34, BB1: 34, Bb1: 34, bB1: 34,
    bf1: 34, BF1: 34, Bf1: 34, bF1: 34, as1: 34, AS1: 34, As1: 34, aS1: 34, b1: 35, B1: 35, bs1: 36, BS1: 36, Bs1: 36,
    bS1: 36, cf2: 35, CF2: 35, Cf2: 35, cF2: 35, cb2: 35, CB2: 35, Cb2: 35, cB2: 35, c2: 36, C2: 36, cs2: 37, CS2: 37,
    cS2: 37, Cs2: 37, df2: 37, DF2: 37, Df2: 37, dF2: 37, db2: 37, DB2: 37, Db2: 37, dB2: 37, d2: 38, D2: 38, eb2: 39,
    EB2: 39, Eb2: 39, eB2: 39, ef2: 39, EF2: 39, Ef2: 39, eF2: 39, ds2: 39, DS2: 39, Ds2: 39, dS2: 39, e2: 40, E2: 40,
    fb2: 40, FB2: 40, Fb2: 40, fB2: 40, ff2: 40, FF2: 40, Ff2: 40, fF2: 40, f2: 41, F2: 41, es2: 41, ES2: 41, Es2: 41,
    eS2: 41, fs2: 42, FS2: 42, Fs2: 42, fS2: 42, gb2: 42, GB2: 42, Gb2: 42, gB2: 42, gf2: 42, GF2: 42, Gf2: 42, gF2: 42,
    g2: 43, G2: 43, gs2: 44, GS2: 44, Gs2: 44, gS2: 44, ab2: 44, AB2: 44, Ab2: 44, aB2: 44, af2: 44, AF2: 44, Af2: 44,
    aF2: 44, a2: 45, A2: 45, bb2: 46, BB2: 46, Bb2: 46, bB2: 46, bf2: 46, BF2: 46, Bf2: 46, bF2: 46, as2: 46, AS2: 46,
    As2: 46, aS2: 46, b2: 47, B2: 47, bs2: 48, BS2: 48, Bs2: 48, bS2: 48, cf3: 47, CF3: 47, Cf3: 47, cF3: 47, cb3: 47,
    CB3: 47, Cb3: 47, cB3: 47, c3: 48, C3: 48, cs3: 49, CS3: 49, cS3: 49, Cs3: 49, df3: 49, DF3: 49, Df3: 49, dF3: 49,
    db3: 49, DB3: 49, Db3: 49, dB3: 49, d3: 50, D3: 50, eb3: 51, EB3: 51, Eb3: 51, eB3: 51, ef3: 51, EF3: 51, Ef3: 51,
    eF3: 51, ds3: 51, DS3: 51, Ds3: 51, dS3: 51, e3: 52, E3: 52, fb3: 52, FB3: 52, Fb3: 52, fB3: 52, ff3: 52, FF3: 52,
    Ff3: 52, fF3: 52, f3: 53, F3: 53, es3: 53, ES3: 53, Es3: 53, eS3: 53, fs3: 54, FS3: 54, Fs3: 54, fS3: 54, gb3: 54,
    GB3: 54, Gb3: 54, gB3: 54, gf3: 54, GF3: 54, Gf3: 54, gF3: 54, g3: 55, G3: 55, gs3: 56, GS3: 56, Gs3: 56, gS3: 56,
    ab3: 56, AB3: 56, Ab3: 56, aB3: 56, af3: 56, AF3: 56, Af3: 56, aF3: 56, a3: 57, A3: 57, bb3: 58, BB3: 58, Bb3: 58,
    bB3: 58, bf3: 58, BF3: 58, Bf3: 58, bF3: 58, as3: 58, AS3: 58, As3: 58, aS3: 58, b3: 59, B3: 59, bs3: 60, BS3: 60,
    Bs3: 60, bS3: 60, cf4: 59, cf: 59, CF4: 59, CF: 59, Cf4: 59, Cf: 59, cF4: 59, cF: 59, cb4: 59, cb: 59, CB4: 59,
    CB: 59, Cb4: 59, Cb: 59, cB4: 59, cB: 59, c4: 60, c: 60, C4: 60, C: 60, cs4: 61, cs: 61, CS4: 61, CS: 61, cS4: 61,
    cS: 61, Cs4: 61, Cs: 61, df4: 61, df: 61, DF4: 61, DF: 61, Df4: 61, Df: 61, dF4: 61, dF: 61, db4: 61, db: 61,
    DB4: 61, DB: 61, Db4: 61, Db: 61, dB4: 61, dB: 61, d4: 62, d: 62, D4: 62, D: 62, eb4: 63, eb: 63, EB4: 63, EB: 63,
    Eb4: 63, Eb: 63, eB4: 63, eB: 63, ef4: 63, ef: 63, EF4: 63, EF: 63, Ef4: 63, Ef: 63, eF4: 63, eF: 63, ds4: 63,
    ds: 63, DS4: 63, DS: 63, Ds4: 63, Ds: 63, dS4: 63, dS: 63, e4: 64, e: 64, E4: 64, E: 64, fb4: 64, fb: 64, FB4: 64,
    FB: 64, Fb4: 64, Fb: 64, fB4: 64, fB: 64, ff4: 64, ff: 64, FF4: 64, FF: 64, Ff4: 64, Ff: 64, fF4: 64, fF: 64,
    f4: 65, f: 65, F4: 65, F: 65, es4: 65, es: 65, ES4: 65, ES: 65, Es4: 65, Es: 65, eS4: 65, eS: 65, fs4: 66, fs: 66,
    FS4: 66, FS: 66, Fs4: 66, Fs: 66, fS4: 66, fS: 66, gb4: 66, gb: 66, GB4: 66, GB: 66, Gb4: 66, Gb: 66, gB4: 66,
    gB: 66, gf4: 66, gf: 66, GF4: 66, GF: 66, Gf4: 66, Gf: 66, gF4: 66, gF: 66, g4: 67, g: 67, G4: 67, G: 67, gs4: 68,
    gs: 68, GS4: 68, GS: 68, Gs4: 68, Gs: 68, gS4: 68, gS: 68, ab4: 68, ab: 68, AB4: 68, AB: 68, Ab4: 68, Ab: 68,
    aB4: 68, aB: 68, af4: 68, af: 68, AF4: 68, AF: 68, Af4: 68, Af: 68, aF4: 68, aF: 68, a4: 69, a: 69, A4: 69, A: 69,
    bb4: 70, bb: 70, BB4: 70, BB: 70, Bb4: 70, Bb: 70, bB4: 70, bB: 70, bf4: 70, bf: 70, BF4: 70, BF: 70, Bf4: 70,
    Bf: 70, bF4: 70, bF: 70, as4: 70, as: 70, AS4: 70, AS: 70, As4: 70, As: 70, aS4: 70, aS: 70, b4: 71, b: 71, B4: 71,
    B: 71, bs4: 72, bs: 72, BS4: 72, BS: 72, Bs4: 72, Bs: 72, bS4: 72, bS: 72, cf5: 71, CF5: 71, Cf5: 71, cF5: 71,
    cb5: 71, CB5: 71, Cb5: 71, cB5: 71, c5: 72, C5: 72, cs5: 73, CS5: 73, cS5: 73, Cs5: 73, df5: 73, DF5: 73, Df5: 73,
    dF5: 73, db5: 73, DB5: 73, Db5: 73, dB5: 73, d5: 74, D5: 74, eb5: 75, EB5: 75, Eb5: 75, eB5: 75, ef5: 75, EF5: 75,
    Ef5: 75, eF5: 75, ds5: 75, DS5: 75, Ds5: 75, dS5: 75, e5: 76, E5: 76, fb5: 76, FB5: 76, Fb5: 76, fB5: 76, ff5: 76,
    FF5: 76, Ff5: 76, fF5: 76, f5: 77, F5: 77, es5: 77, ES5: 77, Es5: 77, eS5: 77, fs5: 78, FS5: 78, Fs5: 78, fS5: 78,
    gb5: 78, GB5: 78, Gb5: 78, gB5: 78, gf5: 78, GF5: 78, Gf5: 78, gF5: 78, g5: 79, G5: 79, gs5: 80, GS5: 80, Gs5: 80,
    gS5: 80, ab5: 80, AB5: 80, Ab5: 80, aB5: 80, af5: 80, AF5: 80, Af5: 80, aF5: 80, a5: 81, A5: 81, bb5: 82, BB5: 82,
    Bb5: 82, bB5: 82, bf5: 82, BF5: 82, Bf5: 82, bF5: 82, as5: 82, AS5: 82, As5: 82, aS5: 82, b5: 83, B5: 83, bs5: 84,
    BS5: 84, Bs5: 84, bS5: 84, cf6: 83, CF6: 83, Cf6: 83, cF6: 83, cb6: 83, CB6: 83, Cb6: 83, cB6: 83, c6: 84, C6: 84,
    cs6: 85, CS6: 85, cS6: 85, Cs6: 85, df6: 85, DF6: 85, Df6: 85, dF6: 85, db6: 85, DB6: 85, Db6: 85, dB6: 85, d6: 86,
    D6: 86, eb6: 87, EB6: 87, Eb6: 87, eB6: 87, ef6: 87, EF6: 87, Ef6: 87, eF6: 87, ds6: 87, DS6: 87, Ds6: 87, dS6: 87,
    e6: 88, E6: 88, fb6: 88, FB6: 88, Fb6: 88, fB6: 88, ff6: 88, FF6: 88, Ff6: 88, fF6: 88, f6: 89, F6: 89, es6: 89,
    ES6: 89, Es6: 89, eS6: 89, fs6: 90, FS6: 90, Fs6: 90, fS6: 90, gb6: 90, GB6: 90, Gb6: 90, gB6: 90, gf6: 90, GF6: 90,
    Gf6: 90, gF6: 90, g6: 91, G6: 91, gs6: 92, GS6: 92, Gs6: 92, gS6: 92, ab6: 92, AB6: 92, Ab6: 92, aB6: 92, af6: 92,
    AF6: 92, Af6: 92, aF6: 92, a6: 93, A6: 93, bb6: 94, BB6: 94, Bb6: 94, bB6: 94, bf6: 94, BF6: 94, Bf6: 94, bF6: 94,
    as6: 94, AS6: 94, As6: 94, aS6: 94, b6: 95, B6: 95, bs6: 96, BS6: 96, Bs6: 96, bS6: 96, cf7: 95, CF7: 95, Cf7: 95,
    cF7: 95, cb7: 95, CB7: 95, Cb7: 95, cB7: 95, c7: 96, C7: 96, cs7: 97, CS7: 97, cS7: 97, Cs7: 97, df7: 97, DF7: 97,
    Df7: 97, dF7: 97, db7: 97, DB7: 97, Db7: 97, dB7: 97, d7: 98, D7: 98, eb7: 99, EB7: 99, Eb7: 99, eB7: 99, ef7: 99,
    EF7: 99, Ef7: 99, eF7: 99, ds7: 99, DS7: 99, Ds7: 99, dS7: 99, e7: 100, E7: 100, fb7: 100, FB7: 100, Fb7: 100,
    fB7: 100, ff7: 100, FF7: 100, Ff7: 100, fF7: 100, f7: 101, F7: 101, es7: 101, ES7: 101, Es7: 101, eS7: 101,
    fs7: 102, FS7: 102, Fs7: 102, fS7: 102, gb7: 102, GB7: 102, Gb7: 102, gB7: 102, gf7: 102, GF7: 102, Gf7: 102,
    gF7: 102, g7: 103, G7: 103, gs7: 104, GS7: 104, Gs7: 104, gS7: 104, ab7: 104, AB7: 104, Ab7: 104, aB7: 104,
    af7: 104, AF7: 104, Af7: 104, aF7: 104, a7: 105, A7: 105, bb7: 106, BB7: 106, Bb7: 106, bB7: 106, bf7: 106,
    BF7: 106, Bf7: 106, bF7: 106, as7: 106, AS7: 106, As7: 106, aS7: 106, b7: 107, B7: 107, bs7: 108, BS7: 108,
    Bs7: 108, bS7: 108, cf8: 107, CF8: 107, Cf8: 107, cF8: 107, cb8: 107, CB8: 107, Cb8: 107, cB8: 107, c8: 108,
    C8: 108, cs8: 109, CS8: 109, cS8: 109, Cs8: 109, df8: 109, DF8: 109, Df8: 109, dF8: 109, db8: 109, DB8: 109,
    Db8: 109, dB8: 109, d8: 110, D8: 110, eb8: 111, EB8: 111, Eb8: 111, eB8: 111, ef8: 111, EF8: 111, Ef8: 111,
    eF8: 111, ds8: 111, DS8: 111, Ds8: 111, dS8: 111, e8: 112, E8: 112, fb8: 112, FB8: 112, Fb8: 112, fB8: 112,
    ff8: 112, FF8: 112, Ff8: 112, fF8: 112, f8: 113, F8: 113, es8: 113, ES8: 113, Es8: 113, eS8: 113, fs8: 114,
    FS8: 114, Fs8: 114, fS8: 114, gb8: 114, GB8: 114, Gb8: 114, gB8: 114, gf8: 114, GF8: 114, Gf8: 114, gF8: 114,
    g8: 115, G8: 115, gs8: 116, GS8: 116, Gs8: 116, gS8: 116, ab8: 116, AB8: 116, Ab8: 116, aB8: 116, af8: 116,
    AF8: 116, Af8: 116, aF8: 116, a8: 117, A8: 117, bb8: 118, BB8: 118, Bb8: 118, bB8: 118, bf8: 118, BF8: 118,
    Bf8: 118, bF8: 118, as8: 118, AS8: 118, As8: 118, aS8: 118, b8: 119, B8: 119, bs8: 120, BS8: 120, Bs8: 120,
    bS8: 120, cf9: 119, CF9: 119, Cf9: 119, cF9: 119, cb9: 119, CB9: 119, Cb9: 119, cB9: 119, c9: 120, C9: 120,
    cs9: 121, CS9: 121, cS9: 121, Cs9: 121, df9: 121, DF9: 121, Df9: 121, dF9: 121, db9: 121, DB9: 121, Db9: 121,
    dB9: 121, d9: 122, D9: 122, eb9: 123, EB9: 123, Eb9: 123, eB9: 123, ef9: 123, EF9: 123, Ef9: 123, eF9: 123,
    ds9: 123, DS9: 123, Ds9: 123, dS9: 123, e9: 124, E9: 124, fb9: 124, FB9: 124, Fb9: 124, fB9: 124, ff9: 124,
    FF9: 124, Ff9: 124, fF9: 124, f9: 125, F9: 125, es9: 125, ES9: 125, Es9: 125, eS9: 125, fs9: 126, FS9: 126,
    Fs9: 126, fS9: 126, gb9: 126, GB9: 126, Gb9: 126, gB9: 126, gf9: 126, GF9: 126, Gf9: 126, gF9: 126, g9: 127,
    G9: 127, gs9: 128, GS9: 128, Gs9: 128, gS9: 128, ab9: 128, AB9: 128, Ab9: 128, aB9: 128, af9: 128, AF9: 128,
    Af9: 128, aF9: 128, a9: 129, A9: 129, bb9: 130, BB9: 130, Bb9: 130, bB9: 130, bf9: 130, BF9: 130, Bf9: 130,
    bF9: 130, as9: 130, AS9: 130, As9: 130, aS9: 130, b9: 131, B9: 131, bs9: 132, BS9: 132, Bs9: 132, bS9: 132
};

const cf0 = 11, CF0 = 11, Cf0 = 11, cF0 = 11, cb0 = 11, CB0 = 11, Cb0 = 11, cB0 = 11, c0 = 12, C0 = 12, cs0 = 13,
    CS0 = 13, cS0 = 13, Cs0 = 13, df0 = 13, DF0 = 13, Df0 = 13, dF0 = 13, db0 = 13, DB0 = 13, Db0 = 13, dB0 = 13,
    d0 = 14, D0 = 14, eb0 = 15, EB0 = 15, Eb0 = 15, eB0 = 15, ef0 = 15, EF0 = 15, Ef0 = 15, eF0 = 15, ds0 = 15,
    DS0 = 15, Ds0 = 15, dS0 = 15, e0 = 16, E0 = 16, fb0 = 16, FB0 = 16, Fb0 = 16, fB0 = 16, ff0 = 16, FF0 = 16,
    Ff0 = 16, fF0 = 16, f0 = 17, F0 = 17, es0 = 17, ES0 = 17, Es0 = 17, eS0 = 17, fs0 = 18, FS0 = 18, Fs0 = 18,
    fS0 = 18, gb0 = 18, GB0 = 18, Gb0 = 18, gB0 = 18, gf0 = 18, GF0 = 18, Gf0 = 18, gF0 = 18, g0 = 19, G0 = 19,
    gs0 = 20, GS0 = 20, Gs0 = 20, gS0 = 20, ab0 = 20, AB0 = 20, Ab0 = 20, aB0 = 20, af0 = 20, AF0 = 20, Af0 = 20,
    aF0 = 20, a0 = 21, A0 = 21, bb0 = 22, BB0 = 22, Bb0 = 22, bB0 = 22, bf0 = 22, BF0 = 22, Bf0 = 22, bF0 = 22,
    as0 = 22, AS0 = 22, As0 = 22, aS0 = 22, b0 = 23, B0 = 23, bs0 = 24, BS0 = 24, Bs0 = 24, bS0 = 24, cf1 = 23,
    CF1 = 23, Cf1 = 23, cF1 = 23, cb1 = 23, CB1 = 23, Cb1 = 23, cB1 = 23, c1 = 24, C1 = 24, cs1 = 25, CS1 = 25,
    cS1 = 25, Cs1 = 25, df1 = 25, DF1 = 25, Df1 = 25, dF1 = 25, db1 = 25, DB1 = 25, Db1 = 25, dB1 = 25, d1 = 26,
    D1 = 26, eb1 = 27, EB1 = 27, Eb1 = 27, eB1 = 27, ef1 = 27, EF1 = 27, Ef1 = 27, eF1 = 27, ds1 = 27, DS1 = 27,
    Ds1 = 27, dS1 = 27, e1 = 28, E1 = 28, fb1 = 28, FB1 = 28, Fb1 = 28, fB1 = 28, ff1 = 28, FF1 = 28, Ff1 = 28,
    fF1 = 28, f1 = 29, F1 = 29, es1 = 29, ES1 = 29, Es1 = 29, eS1 = 29, fs1 = 30, FS1 = 30, Fs1 = 30, fS1 = 30,
    gb1 = 30, GB1 = 30, Gb1 = 30, gB1 = 30, gf1 = 30, GF1 = 30, Gf1 = 30, gF1 = 30, g1 = 31, G1 = 31, gs1 = 32,
    GS1 = 32, Gs1 = 32, gS1 = 32, ab1 = 32, AB1 = 32, Ab1 = 32, aB1 = 32, af1 = 32, AF1 = 32, Af1 = 32, aF1 = 32,
    a1 = 33, A1 = 33, bb1 = 34, BB1 = 34, Bb1 = 34, bB1 = 34, bf1 = 34, BF1 = 34, Bf1 = 34, bF1 = 34, as1 = 34,
    AS1 = 34, As1 = 34, aS1 = 34, b1 = 35, B1 = 35, bs1 = 36, BS1 = 36, Bs1 = 36, bS1 = 36, cf2 = 35, CF2 = 35,
    Cf2 = 35, cF2 = 35, cb2 = 35, CB2 = 35, Cb2 = 35, cB2 = 35, c2 = 36, C2 = 36, cs2 = 37, CS2 = 37, cS2 = 37,
    Cs2 = 37, df2 = 37, DF2 = 37, Df2 = 37, dF2 = 37, db2 = 37, DB2 = 37, Db2 = 37, dB2 = 37, d2 = 38, D2 = 38,
    eb2 = 39, EB2 = 39, Eb2 = 39, eB2 = 39, ef2 = 39, EF2 = 39, Ef2 = 39, eF2 = 39, ds2 = 39, DS2 = 39, Ds2 = 39,
    dS2 = 39, e2 = 40, E2 = 40, fb2 = 40, FB2 = 40, Fb2 = 40, fB2 = 40, ff2 = 40, FF2 = 40, Ff2 = 40, fF2 = 40, f2 = 41,
    F2 = 41, es2 = 41, ES2 = 41, Es2 = 41, eS2 = 41, fs2 = 42, FS2 = 42, Fs2 = 42, fS2 = 42, gb2 = 42, GB2 = 42,
    Gb2 = 42, gB2 = 42, gf2 = 42, GF2 = 42, Gf2 = 42, gF2 = 42, g2 = 43, G2 = 43, gs2 = 44, GS2 = 44, Gs2 = 44,
    gS2 = 44, ab2 = 44, AB2 = 44, Ab2 = 44, aB2 = 44, af2 = 44, AF2 = 44, Af2 = 44, aF2 = 44, a2 = 45, A2 = 45,
    bb2 = 46, BB2 = 46, Bb2 = 46, bB2 = 46, bf2 = 46, BF2 = 46, Bf2 = 46, bF2 = 46, as2 = 46, AS2 = 46, As2 = 46,
    aS2 = 46, b2 = 47, B2 = 47, bs2 = 48, BS2 = 48, Bs2 = 48, bS2 = 48, cf3 = 47, CF3 = 47, Cf3 = 47, cF3 = 47,
    cb3 = 47, CB3 = 47, Cb3 = 47, cB3 = 47, c3 = 48, C3 = 48, cs3 = 49, CS3 = 49, cS3 = 49, Cs3 = 49, df3 = 49,
    DF3 = 49, Df3 = 49, dF3 = 49, db3 = 49, DB3 = 49, Db3 = 49, dB3 = 49, d3 = 50, D3 = 50, eb3 = 51, EB3 = 51,
    Eb3 = 51, eB3 = 51, ef3 = 51, EF3 = 51, Ef3 = 51, eF3 = 51, ds3 = 51, DS3 = 51, Ds3 = 51, dS3 = 51, e3 = 52,
    E3 = 52, fb3 = 52, FB3 = 52, Fb3 = 52, fB3 = 52, ff3 = 52, FF3 = 52, Ff3 = 52, fF3 = 52, f3 = 53, F3 = 53, es3 = 53,
    ES3 = 53, Es3 = 53, eS3 = 53, fs3 = 54, FS3 = 54, Fs3 = 54, fS3 = 54, gb3 = 54, GB3 = 54, Gb3 = 54, gB3 = 54,
    gf3 = 54, GF3 = 54, Gf3 = 54, gF3 = 54, g3 = 55, G3 = 55, gs3 = 56, GS3 = 56, Gs3 = 56, gS3 = 56, ab3 = 56,
    AB3 = 56, Ab3 = 56, aB3 = 56, af3 = 56, AF3 = 56, Af3 = 56, aF3 = 56, a3 = 57, A3 = 57, bb3 = 58, BB3 = 58,
    Bb3 = 58, bB3 = 58, bf3 = 58, BF3 = 58, Bf3 = 58, bF3 = 58, as3 = 58, AS3 = 58, As3 = 58, aS3 = 58, b3 = 59,
    B3 = 59, bs3 = 60, BS3 = 60, Bs3 = 60, bS3 = 60, cf4 = 59, cf = 59, CF4 = 59, CF = 59, Cf4 = 59, Cf = 59, cF4 = 59,
    cF = 59, cb4 = 59, cb = 59, CB4 = 59, CB = 59, Cb4 = 59, Cb = 59, cB4 = 59, cB = 59, c4 = 60, c = 60, C4 = 60,
    C = 60, cs4 = 61, cs = 61, CS4 = 61, CS = 61, cS4 = 61, cS = 61, Cs4 = 61, Cs = 61, df4 = 61, df = 61, DF4 = 61,
    DF = 61, Df4 = 61, Df = 61, dF4 = 61, dF = 61, db4 = 61, db = 61, DB4 = 61, DB = 61, Db4 = 61, Db = 61, dB4 = 61,
    dB = 61, d4 = 62, d = 62, D4 = 62, D = 62, eb4 = 63, eb = 63, EB4 = 63, EB = 63, Eb4 = 63, Eb = 63, eB4 = 63,
    eB = 63, ef4 = 63, ef = 63, EF4 = 63, EF = 63, Ef4 = 63, Ef = 63, eF4 = 63, eF = 63, ds4 = 63, ds = 63, DS4 = 63,
    DS = 63, Ds4 = 63, Ds = 63, dS4 = 63, dS = 63, e4 = 64, e = 64, E4 = 64, E = 64, fb4 = 64, fb = 64, FB4 = 64,
    FB = 64, Fb4 = 64, Fb = 64, fB4 = 64, fB = 64, ff4 = 64, ff = 64, FF4 = 64, FF = 64, Ff4 = 64, Ff = 64, fF4 = 64,
    fF = 64, f4 = 65, f = 65, F4 = 65, F = 65, es4 = 65, es = 65, ES4 = 65, ES = 65, Es4 = 65, Es = 65, eS4 = 65,
    eS = 65, fs4 = 66, fs = 66, FS4 = 66, FS = 66, Fs4 = 66, Fs = 66, fS4 = 66, fS = 66, gb4 = 66, gb = 66, GB4 = 66,
    GB = 66, Gb4 = 66, Gb = 66, gB4 = 66, gB = 66, gf4 = 66, gf = 66, GF4 = 66, GF = 66, Gf4 = 66, Gf = 66, gF4 = 66,
    gF = 66, g4 = 67, g = 67, G4 = 67, G = 67, gs4 = 68, gs = 68, GS4 = 68, GS = 68, Gs4 = 68, Gs = 68, gS4 = 68,
    gS = 68, ab4 = 68, ab = 68, AB4 = 68, AB = 68, Ab4 = 68, Ab = 68, aB4 = 68, aB = 68, af4 = 68, af = 68, AF4 = 68,
    AF = 68, Af4 = 68, Af = 68, aF4 = 68, aF = 68, a4 = 69, a = 69, A4 = 69, A = 69, bb4 = 70, bb = 70, BB4 = 70,
    BB = 70, Bb4 = 70, Bb = 70, bB4 = 70, bB = 70, bf4 = 70, bf = 70, BF4 = 70, BF = 70, Bf4 = 70, Bf = 70, bF4 = 70,
    bF = 70, as4 = 70, as = 70, AS4 = 70, AS = 70, As4 = 70, As = 70, aS4 = 70, aS = 70, b4 = 71, b = 71, B4 = 71,
    B = 71, bs4 = 72, bs = 72, BS4 = 72, BS = 72, Bs4 = 72, Bs = 72, bS4 = 72, bS = 72, cf5 = 71, CF5 = 71, Cf5 = 71,
    cF5 = 71, cb5 = 71, CB5 = 71, Cb5 = 71, cB5 = 71, c5 = 72, C5 = 72, cs5 = 73, CS5 = 73, cS5 = 73, Cs5 = 73,
    df5 = 73, DF5 = 73, Df5 = 73, dF5 = 73, db5 = 73, DB5 = 73, Db5 = 73, dB5 = 73, d5 = 74, D5 = 74, eb5 = 75,
    EB5 = 75, Eb5 = 75, eB5 = 75, ef5 = 75, EF5 = 75, Ef5 = 75, eF5 = 75, ds5 = 75, DS5 = 75, Ds5 = 75, dS5 = 75,
    e5 = 76, E5 = 76, fb5 = 76, FB5 = 76, Fb5 = 76, fB5 = 76, ff5 = 76, FF5 = 76, Ff5 = 76, fF5 = 76, f5 = 77, F5 = 77,
    es5 = 77, ES5 = 77, Es5 = 77, eS5 = 77, fs5 = 78, FS5 = 78, Fs5 = 78, fS5 = 78, gb5 = 78, GB5 = 78, Gb5 = 78,
    gB5 = 78, gf5 = 78, GF5 = 78, Gf5 = 78, gF5 = 78, g5 = 79, G5 = 79, gs5 = 80, GS5 = 80, Gs5 = 80, gS5 = 80,
    ab5 = 80, AB5 = 80, Ab5 = 80, aB5 = 80, af5 = 80, AF5 = 80, Af5 = 80, aF5 = 80, a5 = 81, A5 = 81, bb5 = 82,
    BB5 = 82, Bb5 = 82, bB5 = 82, bf5 = 82, BF5 = 82, Bf5 = 82, bF5 = 82, as5 = 82, AS5 = 82, As5 = 82, aS5 = 82,
    b5 = 83, B5 = 83, bs5 = 84, BS5 = 84, Bs5 = 84, bS5 = 84, cf6 = 83, CF6 = 83, Cf6 = 83, cF6 = 83, cb6 = 83,
    CB6 = 83, Cb6 = 83, cB6 = 83, c6 = 84, C6 = 84, cs6 = 85, CS6 = 85, cS6 = 85, Cs6 = 85, df6 = 85, DF6 = 85,
    Df6 = 85, dF6 = 85, db6 = 85, DB6 = 85, Db6 = 85, dB6 = 85, d6 = 86, D6 = 86, eb6 = 87, EB6 = 87, Eb6 = 87,
    eB6 = 87, ef6 = 87, EF6 = 87, Ef6 = 87, eF6 = 87, ds6 = 87, DS6 = 87, Ds6 = 87, dS6 = 87, e6 = 88, E6 = 88,
    fb6 = 88, FB6 = 88, Fb6 = 88, fB6 = 88, ff6 = 88, FF6 = 88, Ff6 = 88, fF6 = 88, f6 = 89, F6 = 89, es6 = 89,
    ES6 = 89, Es6 = 89, eS6 = 89, fs6 = 90, FS6 = 90, Fs6 = 90, fS6 = 90, gb6 = 90, GB6 = 90, Gb6 = 90, gB6 = 90,
    gf6 = 90, GF6 = 90, Gf6 = 90, gF6 = 90, g6 = 91, G6 = 91, gs6 = 92, GS6 = 92, Gs6 = 92, gS6 = 92, ab6 = 92,
    AB6 = 92, Ab6 = 92, aB6 = 92, af6 = 92, AF6 = 92, Af6 = 92, aF6 = 92, a6 = 93, A6 = 93, bb6 = 94, BB6 = 94,
    Bb6 = 94, bB6 = 94, bf6 = 94, BF6 = 94, Bf6 = 94, bF6 = 94, as6 = 94, AS6 = 94, As6 = 94, aS6 = 94, b6 = 95,
    B6 = 95, bs6 = 96, BS6 = 96, Bs6 = 96, bS6 = 96, cf7 = 95, CF7 = 95, Cf7 = 95, cF7 = 95, cb7 = 95, CB7 = 95,
    Cb7 = 95, cB7 = 95, c7 = 96, C7 = 96, cs7 = 97, CS7 = 97, cS7 = 97, Cs7 = 97, df7 = 97, DF7 = 97, Df7 = 97,
    dF7 = 97, db7 = 97, DB7 = 97, Db7 = 97, dB7 = 97, d7 = 98, D7 = 98, eb7 = 99, EB7 = 99, Eb7 = 99, eB7 = 99,
    ef7 = 99, EF7 = 99, Ef7 = 99, eF7 = 99, ds7 = 99, DS7 = 99, Ds7 = 99, dS7 = 99, e7 = 100, E7 = 100, fb7 = 100,
    FB7 = 100, Fb7 = 100, fB7 = 100, ff7 = 100, FF7 = 100, Ff7 = 100, fF7 = 100, f7 = 101, F7 = 101, es7 = 101,
    ES7 = 101, Es7 = 101, eS7 = 101, fs7 = 102, FS7 = 102, Fs7 = 102, fS7 = 102, gb7 = 102, GB7 = 102, Gb7 = 102,
    gB7 = 102, gf7 = 102, GF7 = 102, Gf7 = 102, gF7 = 102, g7 = 103, G7 = 103, gs7 = 104, GS7 = 104, Gs7 = 104,
    gS7 = 104, ab7 = 104, AB7 = 104, Ab7 = 104, aB7 = 104, af7 = 104, AF7 = 104, Af7 = 104, aF7 = 104, a7 = 105,
    A7 = 105, bb7 = 106, BB7 = 106, Bb7 = 106, bB7 = 106, bf7 = 106, BF7 = 106, Bf7 = 106, bF7 = 106, as7 = 106,
    AS7 = 106, As7 = 106, aS7 = 106, b7 = 107, B7 = 107, bs7 = 108, BS7 = 108, Bs7 = 108, bS7 = 108, cf8 = 107,
    CF8 = 107, Cf8 = 107, cF8 = 107, cb8 = 107, CB8 = 107, Cb8 = 107, cB8 = 107, c8 = 108, C8 = 108, cs8 = 109,
    CS8 = 109, cS8 = 109, Cs8 = 109, df8 = 109, DF8 = 109, Df8 = 109, dF8 = 109, db8 = 109, DB8 = 109, Db8 = 109,
    dB8 = 109, d8 = 110, D8 = 110, eb8 = 111, EB8 = 111, Eb8 = 111, eB8 = 111, ef8 = 111, EF8 = 111, Ef8 = 111,
    eF8 = 111, ds8 = 111, DS8 = 111, Ds8 = 111, dS8 = 111, e8 = 112, E8 = 112, fb8 = 112, FB8 = 112, Fb8 = 112,
    fB8 = 112, ff8 = 112, FF8 = 112, Ff8 = 112, fF8 = 112, f8 = 113, F8 = 113, es8 = 113, ES8 = 113, Es8 = 113,
    eS8 = 113, fs8 = 114, FS8 = 114, Fs8 = 114, fS8 = 114, gb8 = 114, GB8 = 114, Gb8 = 114, gB8 = 114, gf8 = 114,
    GF8 = 114, Gf8 = 114, gF8 = 114, g8 = 115, G8 = 115, gs8 = 116, GS8 = 116, Gs8 = 116, gS8 = 116, ab8 = 116,
    AB8 = 116, Ab8 = 116, aB8 = 116, af8 = 116, AF8 = 116, Af8 = 116, aF8 = 116, a8 = 117, A8 = 117, bb8 = 118,
    BB8 = 118, Bb8 = 118, bB8 = 118, bf8 = 118, BF8 = 118, Bf8 = 118, bF8 = 118, as8 = 118, AS8 = 118, As8 = 118,
    aS8 = 118, b8 = 119, B8 = 119, bs8 = 120, BS8 = 120, Bs8 = 120, bS8 = 120, cf9 = 119, CF9 = 119, Cf9 = 119,
    cF9 = 119, cb9 = 119, CB9 = 119, Cb9 = 119, cB9 = 119, c9 = 120, C9 = 120, cs9 = 121, CS9 = 121, cS9 = 121,
    Cs9 = 121, df9 = 121, DF9 = 121, Df9 = 121, dF9 = 121, db9 = 121, DB9 = 121, Db9 = 121, dB9 = 121, d9 = 122,
    D9 = 122, eb9 = 123, EB9 = 123, Eb9 = 123, eB9 = 123, ef9 = 123, EF9 = 123, Ef9 = 123, eF9 = 123, ds9 = 123,
    DS9 = 123, Ds9 = 123, dS9 = 123, e9 = 124, E9 = 124, fb9 = 124, FB9 = 124, Fb9 = 124, fB9 = 124, ff9 = 124,
    FF9 = 124, Ff9 = 124, fF9 = 124, f9 = 125, F9 = 125, es9 = 125, ES9 = 125, Es9 = 125, eS9 = 125, fs9 = 126,
    FS9 = 126, Fs9 = 126, fS9 = 126, gb9 = 126, GB9 = 126, Gb9 = 126, gB9 = 126, gf9 = 126, GF9 = 126, Gf9 = 126,
    gF9 = 126, g9 = 127, G9 = 127, gs9 = 128, GS9 = 128, Gs9 = 128, gS9 = 128, ab9 = 128, AB9 = 128, Ab9 = 128,
    aB9 = 128, af9 = 128, AF9 = 128, Af9 = 128, aF9 = 128, a9 = 129, A9 = 129, bb9 = 130, BB9 = 130, Bb9 = 130,
    bB9 = 130, bf9 = 130, BF9 = 130, Bf9 = 130, bF9 = 130, as9 = 130, AS9 = 130, As9 = 130, aS9 = 130, b9 = 131,
    B9 = 131, bs9 = 132, BS9 = 132, Bs9 = 132, bS9 = 132;

const scales = {
    'diatonic': [2, 2, 1, 2, 2, 2, 1],
    'ionian': [2, 2, 1, 2, 2, 2, 1],
    'major': [2, 2, 1, 2, 2, 2, 1],
    'dorian': [2, 1, 2, 2, 2, 1, 2],
    'phrygian': [1, 2, 2, 2, 1, 2, 2],
    'lydian': [2, 2, 2, 1, 2, 2, 1],
    'mixolydian': [2, 2, 1, 2, 2, 1, 2],
    'aeolian': [2, 1, 2, 2, 1, 2, 2],
    'minor': [2, 1, 2, 2, 1, 2, 2],
    'locrian': [1, 2, 2, 1, 2, 2, 2],
    'hex_major6': [2, 2, 1, 2, 2, 3],
    'hex_dorian': [2, 1, 2, 2, 3, 2],
    'hex_phrygian': [1, 2, 2, 3, 2, 2],
    'hex_major7': [2, 2, 3, 2, 2, 1],
    'hex_sus': [2, 3, 2, 2, 1, 2],
    'hex_aeolian': [3, 2, 2, 1, 2, 2],
    'minor_pentatonic': [3, 2, 2, 3, 2],
    'yu': [3, 2, 2, 3, 2],
    'major_pentatonic': [2, 2, 3, 2, 3],
    'gong': [2, 2, 3, 2, 3],
    'egyptian': [2, 3, 2, 3, 2],
    'shang': [2, 3, 2, 3, 2],
    'jiao': [3, 2, 3, 2, 2],
    'zhi': [2, 3, 2, 2, 3],
    'ritusen': [2, 3, 2, 2, 3],
    'whole_tone': [2, 2, 2, 2, 2, 2],
    'whole': [2, 2, 2, 2, 2, 2],
    'chromatic': [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    'harmonic_minor': [2, 1, 2, 2, 1, 3, 1],
    'melodic_minor_asc': [2, 1, 2, 2, 2, 2, 1],
    'hungarian_minor': [2, 1, 3, 1, 1, 3, 1],
    'octatonic': [2, 1, 2, 1, 2, 1, 2, 1],
    'messiaen1': [2, 2, 2, 2, 2, 2],
    'messiaen2': [1, 2, 1, 2, 1, 2, 1, 2],
    'messiaen3': [2, 1, 1, 2, 1, 1, 2, 1, 1],
    'messiaen4': [1, 1, 3, 1, 1, 1, 3, 1],
    'messiaen5': [1, 4, 1, 1, 4, 1],
    'messiaen6': [2, 2, 1, 1, 2, 2, 1, 1],
    'messiaen7': [1, 1, 1, 2, 1, 1, 1, 1, 2, 1],
    'super_locrian': [1, 2, 1, 2, 2, 2, 2],
    'hirajoshi': [2, 1, 4, 1, 4],
    'kumoi': [2, 1, 4, 2, 3],
    'neapolitan_major': [1, 2, 2, 2, 2, 2, 1],
    'bartok': [2, 2, 1, 2, 1, 2, 2],
    'bhairav': [1, 3, 1, 2, 1, 3, 1],
    'locrian_major': [2, 2, 1, 1, 2, 2, 2],
    'ahirbhairav': [1, 3, 1, 2, 2, 1, 2],
    'enigmatic': [1, 3, 2, 2, 2, 1, 1],
    'neapolitan_minor': [1, 2, 2, 2, 1, 3, 1],
    'pelog': [1, 2, 4, 1, 4],
    'augmented2': [1, 3, 1, 3, 1, 3],
    'scriabin': [1, 3, 3, 2, 3],
    'harmonic_major': [2, 2, 1, 2, 1, 3, 1],
    'melodic_minor_desc': [2, 1, 2, 2, 1, 2, 2],
    'romanian_minor': [2, 1, 3, 1, 2, 1, 2],
    'hindu': [2, 2, 1, 2, 1, 2, 2],
    'iwato': [1, 4, 1, 4, 2],
    'melodic_minor': [2, 1, 2, 2, 2, 2, 1],
    'diminished2': [2, 1, 2, 1, 2, 1, 2, 1],
    'marva': [1, 3, 2, 1, 2, 2, 1],
    'melodic_major': [2, 2, 1, 2, 1, 2, 2],
    'indian': [4, 1, 2, 3, 2],
    'spanish': [1, 3, 1, 2, 1, 2, 2],
    'prometheus': [2, 2, 2, 5, 1],
    'diminished': [1, 2, 1, 2, 1, 2, 1, 2],
    'todi': [1, 2, 3, 1, 1, 3, 1],
    'leading_whole': [2, 2, 2, 2, 2, 1, 1],
    'augmented': [3, 1, 3, 1, 3, 1],
    'purvi': [1, 3, 2, 1, 1, 3, 1],
    'chinese': [4, 2, 1, 4, 1],
    'lydian_minor': [2, 2, 2, 1, 1, 2, 2],
    'blues_major': [2, 1, 1, 3, 2, 3],
    'blues_minor': [3, 2, 1, 1, 3, 2]
};

const major = [0, 4, 7];
const minor = [0, 3, 7];
const major7 = [0, 4, 7, 11];
const dom7 = [0, 4, 7, 10];
const minor7 = [0, 3, 7, 10];
const aug = [0, 4, 8];
const dim = [0, 3, 6];
const dim7 = [0, 3, 6, 9];
const halfdim = [0, 3, 6, 10];

const chords = {
    '1': [0],
    '5': [0, 7],
    '+5': [0, 4, 8],
    'm+5': [0, 3, 8],
    sus2: [0, 2, 7],
    sus4: [0, 5, 7],
    '6': [0, 4, 7, 9],
    m6: [0, 3, 7, 9],
    '7sus2': [0, 2, 7, 10],
    '7sus4': [0, 5, 7, 10],
    '7-5': [0, 4, 6, 10],
    halfdiminished: halfdim,
    '7+5': [0, 4, 8, 10],
    'm7+5': [0, 3, 8, 10],
    '9': [0, 4, 7, 10, 14],
    m9: [0, 3, 7, 10, 14],
    'm7+9': [0, 3, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    '9sus4': [0, 5, 7, 10, 14],
    '6*9': [0, 4, 7, 9, 14],
    'm6*9': [0, 3, 7, 9, 14],
    '7-9': [0, 4, 7, 10, 13],
    'm7-9': [0, 3, 7, 10, 13],
    '7-10': [0, 4, 7, 10, 15],
    '7-11': [0, 4, 7, 10, 16],
    '7-13': [0, 4, 7, 10, 20],
    '9+5': [0, 10, 13],
    'm9+5': [0, 10, 14],
    '7+5-9': [0, 4, 8, 10, 13],
    'm7+5-9': [0, 3, 8, 10, 13],
    '11': [0, 4, 7, 10, 14, 17],
    m11: [0, 3, 7, 10, 14, 17],
    maj11: [0, 4, 7, 11, 14, 17],
    '11+': [0, 4, 7, 10, 14, 18],
    'm11+': [0, 3, 7, 10, 14, 18],
    '13': [0, 4, 7, 10, 14, 17, 21],
    m13: [0, 3, 7, 10, 14, 17, 21],
    add2: [0, 2, 4, 7],
    add4: [0, 4, 5, 7],
    add9: [0, 4, 7, 14],
    add11: [0, 4, 7, 17],
    add13: [0, 4, 7, 21],
    madd2: [0, 2, 3, 7],
    madd4: [0, 3, 5, 7],
    madd9: [0, 3, 7, 14],
    madd11: [0, 3, 7, 17],
    madd13: [0, 3, 7, 21],
    major: major,
    maj: major,
    M: major,
    minor: minor,
    min: minor,
    m: minor,
    major7: major7,
    dom7: dom7,
    '7': dom7,
    M7: major7,
    minor7: minor7,
    m7: minor7,
    augmented: aug,
    a: aug,
    diminished: dim,
    dim: dim,
    i: dim,
    diminished7: dim7,
    dim7: dim7,
    i7: dim7,
    halfdim: halfdim,
    'm7b5': halfdim,
    'm7-5': halfdim
};

function chord(base, notes = [0]) {
    return notes.map(n => n + base);
}

function scale(base, notes = [], octaves = 1) {
    const ret = [base];
    let b = base;
    for (let i = 0; i < octaves; i++) {
        for (let j = 0; j < notes.length; j++) {
            ret.push(b += notes[j]);
        }
    }
    return ret;
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

const optionsProxyHandler = {
    set: (options, key, value) => {
        if (loopActive) {
            loopOperators.push({
                type: LOOP_OPERATOR_OPTION,
                startTick: ditty.tick,
                options,
                key,
                value,
            });
        } else {
            options[key] = value;
        }
    }
};

class Options {
    constructor(options) {
        this.startTick = ditty.tick;
        this.extend(options);

        this.proxy = new Proxy(this, optionsProxyHandler);
    }

    get tick() {
        return ditty.tick - this.startTick;
    }

    extend(options) {
        for (const k in options) {
            if (k in this) {
                continue;
            }

            let option = options[k];
            if (option instanceof EnvelopeDef) option = option._options.name;

            if (option instanceof Function) {
                Object.defineProperty(this, k, {
                    get: () => option(this.tick, this),
                });
            } else {
                this[k] = option;
            }
        }
        return this;
    }
}

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


class Envelope {
    constructor(func, options, defaultOptions) {
        this._options = (options instanceof Options ? options : new Options(options)).extend(defaultOptions);
        this.startTick = ditty.tick;

        this.currentTick = -1;
        this._value = 0;

        if (isClass(func)) {
            this.func = new func(this._options);
        }
    }

    get active() {
        return this._options.tick < this.func.duration(this._options);
    }

    get options() {
        return this._options.proxy;
    }

    get duration() {
        return this.func.duration(this._options);
    }

    get value() {
        if (this.currentTick !== ditty.tick) {
            this.currentTick = ditty.tick;
            this._value = this.func.value(this._options.tick, this._options);
        }
        return this._value;
    }

    get progress() {
        return clamp01(this._options.tick / this.duration);
    }
}

class EnvelopeDef {
    constructor(func, defaultOptions = {}) {
        this.func = func;
        this._options = {...defaultOptions};
    }

    create(options = {}) {
        return new Envelope(this.func, options, {...this._options});
    }
}

class EnvelopeManager {
    constructor() {
        this._envelopes = {};
        this._id = 0;
    }

    def(func, defaultOptions = {}) {
        const name = defaultOptions.name || `envelope_${this._id}`;
        if (!defaultOptions.name) this._id++;

        try {
            Object.defineProperty(this, name, {
                get: () => this._envelopes[name]
            });
        } catch (e) {
        }

        return this._envelopes[name] = new EnvelopeDef(func, defaultOptions);
    }

    create(name, options = {}) {
        const def = this._envelopes[name] || this._envelopes['adsr'];
        return def.create(options);
    }
}

const env = new EnvelopeManager();

class envBase {
    init(options) {

        if (this.checkOptions(options)) {
            this._options = options;
            this.sustainNode = options.releaseNode;
            this._value = options.levels[0];
        } else {
            this._options = {levels: [], duration: 0};
            this.sustainNode = -1;
        }

        this._index = 0;
        this._totalDuration = 0;
        this._endTick = 0;

        this.setStepValues(0);
    }

    checkOptions(options) {

        return true;
    }

    setStepValues(tick) {
        const duration = this._options.duration;
        let endTick;

        if (this._index === this.sustainNode && tick < duration) {
            this._endTick = endTick = duration;
        } else {
            this._index++;
            if (this._index >= this._options.levels.length) {
                this._totalDuration = 0;
                return false;
            }
            endTick = tick + (this._index > 0 ? second_to_tick(this._options.times[this._index - 1]) : 0);
            this._endTick = this._index <= this.sustainNode ? Math.min(duration, endTick) : endTick;
        }

        this._target = this._options.levels[this._index];
        this._curve = Array.isArray(this._options.curves) ? this._index > 0 ? this._options.curves[this._index - 1] : 0 : parseFloat(this._options.curve);

        const count = (endTick - tick) / ditty.dtick;
        if (count > 0) {
            if (this._curve) {
                this._a1 = (this._target - this._value) / (1 - Math.exp(this._curve));
                this._a2 = this._value + this._a1;
                this._grow = Math.exp(this._curve / Math.ceil(count));
            } else {
                this._grow = (this._target - this._value) / count;
            }
        } else {
            this._grow = 0;
            this._curve = 0;
        }

        this._totalDuration = this.sustainNode > 0 ?
            duration + second_to_tick(this._options.times[this.sustainNode]) :
            second_to_tick(this._options.times.reduce((p, c) => p + c, 0));

        return true;
    }

    value(tick) {
        for (; tick > this._endTick && this.setStepValues(tick);) {
        }

        return this._curve ?
            (this._a1 *= this._grow, this._value = this._a2 - this._a1) :
            this._value += this._grow;
    }

    duration() {
        return this._totalDuration;
    }
}

const adsr = env.def(class extends envBase {
    constructor(options) {
        super();
        const duration = Math.max(options.duration, second_to_tick(options.attack + options.decay));
        const curve = options.curve;

        this.init({
            levels: [options.attack > 0 ? 0 : 1, 1, options.sustain, 0],
            times: [options.attack, options.decay, options.release],
            duration: duration,
            curves: Array.isArray(curve) ? curve : [0, curve, curve],
            releaseNode: 2
        });
    }
}, {
    attack: 0,
    decay: 0,
    duration: 0,
    sustain: 1,
    release: .5,
    curve: -2,
    name: 'adsr'
});

const adsr2 = env.def(class extends envBase {
    constructor(options) {
        super();
        const duration = options.attack + options.decay + options.sustain + options.release;

        this.init({
            levels: [options.attack > 0 ? 0 : options.attack_level, options.attack_level, options.decay_level, options.sustain_level, 0],
            times: [options.attack, options.decay, options.sustain, options.release].map(v => tick_to_second(v)),
            duration: duration,
            curves: [0, 0, 0, 0],
            releaseNode: -1
        });
    }
}, {
    attack: 0,
    attack_level: 1,
    decay: 0,
    decay_level: 1,
    sustain: 0,
    sustain_level: 1,
    release: 1,
    name: 'adsr2'
});

const segenv = env.def(class extends envBase {
    constructor(options) {
        super();
        this.init(options);
    }
}, {
    levels: [0, 1, 0.5, 0],
    times: [0.1, 0.1, 0.25],
    duration: 0.5,
    curves: [0, -2, -2],
    releaseNode: 2,
    name: 'segenv'
});

const one = env.def(class {
    value() {
        return 1;
    }

    duration(options) {
        return options.duration;
    }
}, {duration: 1e100, name: 'one'});

if (![1].choose) {
    Object.defineProperty(Array.prototype, 'choose', {
        value: function () {
            return this[Math.random() * this.length | 0];
        }
    });

    Object.defineProperty(Array.prototype, 'ring', {
        value: function (i = 0) {
            return this[(i | 0) % this.length];
        }
    });

    Object.defineProperty(Array.prototype, 'mirror', {
        value: function () {
            return [...this, ...[...this].reverse()];
        }
    });

    Object.defineProperty(String.prototype, 'choose', {
        value: function () {
            return this[Math.random() * this.length | 0];
        }
    });

    Object.defineProperty(String.prototype, 'ring', {
        value: function (i = 0) {
            return this[(i | 0) % this.length];
        }
    });

    Object.defineProperty(String.prototype, 'mirror', {
        value: function () {
            return [...this, ...[...this].reverse()];
        }
    });
}

function isClass(a) {
    return !!(a instanceof Function && a.prototype);
}


class Synth {
    constructor(func, note, options = {}, defaultOptions = {}) {
        this._options = new Options(Object.assign({
            amp: 1,
            pan: 0,
            note: typeof note === 'string' ? notes[note] : note,
            env: adsr
        }, defaultOptions, options));

        this.phase = 0;
        this.tick = 0;

        this._isClass = isClass(func);
        this._gen = this._isClass ? (this._gen = new func(this._options), this._gen.process.bind(this._gen)) : func;

        this.env = env.create(this._options.env, this._options);
    }

    get options() {
        return this._options.proxy;
    }

    get note() {
        return this._options.note;
    }

    set note(v) {
        this._options.note = v;
    }

    get name() {
        return this._options.name;
    }

    process() {
        if (this.env.active) {
            const note = this._options.note;

            let v = this._gen(this._isClass ? note : this.phase += midi_to_hz(note) * ditty.dt, this.env, this._options.tick, this._options);

            const a = Array.isArray(v);



            return filterPanAmp(a ? v : [v, v], this._options.pan, this._options.amp);
        }
    }
}

class SynthDef {
    constructor(func, defaultOptions = {}) {
        this.func = func;
        this._options = {...defaultOptions};
    }

    play(n = c5, options = {}) {
        return this.play_timed(n, 0, options);
    }

    play_timed(n, tick_offset, options = {}) {
        const old_tick = ditty.tick;
        ditty.tick += tick_offset;
        const synth = new Synth(this.func, n, {...options}, {...this._options});
        loopOperators.push({type: LOOP_OPERATOR_SYNTH, startTick: ditty.tick, synth: synth});
        ditty.tick = old_tick;
        return synth;
    }
}

class SynthManager {
    constructor() {
        this._synths = {};
        this._id = 0;
    }

    def(func, defaultOptions = {}) {
        const name = defaultOptions.name || `synth_${this._id}`;
        if (!defaultOptions.name) this._id++;

        try {
            Object.defineProperty(this, name, {
                get: () => this._synths[name]
            });
        } catch (e) {
        }

        return this._synths[name] = new SynthDef(func, Object.assign({name, amp: 1, pan: 0}, defaultOptions));
    }
}

const synth = new SynthManager();

const sine = synth.def((phase, env) => Math.sin(phase * Math.PI * 2) * env.value, {name: 'sine'});


class Filter {
    constructor(func, runAs = RUN_AS_INLINE, options = {}, defaultOptions = {}) {
        this._options = new Options(Object.assign(defaultOptions, options));

        this._func = func;
        this._gen = undefined;

        this.runAs = runAs;

        this._filters = [];
        this._out = {
            nodeType: this.runAs === RUN_AS_WORKER ? NODE_TYPE_OUT : NODE_TYPE_INLINE
        }
    }

    get options() {
        return this._options.proxy;
    }

    get name() {
        return this._options.name;
    }

    init() {
        if (isClass(this._func)) {
            const c = new this._func(this._options);
            if (c.process) {
                this._gen = c.process.bind(c);
            } else {
                throw(`${this.name}: No process method implemented`);
            }
        } else {
            this._gen = this._func;
        }

        this._filters.forEach(filter => filter.init());
    }

    process(input) {
        // this._options.tick = ditty.tick;

        const v = this._gen(input, this._options);



        [input[0], input[1]] = v;

        this._filters.forEach(f => f.process(input));
    }

    connect(filter) {
        if (this._out.nodeType === NODE_TYPE_FILTER) {
            throw(`${this.name} can't connect - already connected to shared filter.`);
        }
        if (filter.runAs === RUN_AS_WORKER) {
            this._out.nodeType = NODE_TYPE_FILTER;
            this._out.name = filter.name;
        } else {
            this._filters.push(filter);
        }
        return this;
    }

    structure() {
        return {
            name: this.name, nodeType: NODE_TYPE_FILTER, runAs: this.runAs,
            out: this._out
        };
    }
}

class FilterDef {
    constructor(func, defaultOptions = {}) {
        this.func = func;
        this._options = {...defaultOptions};
    }

    create(options, runAs = RUN_AS_INLINE) {
        return ditty.addFilter(new Filter(this.func, runAs, {...options}, {...this._options}));
    }

    createShared(options) {
        return this.create(options, RUN_AS_WORKER);
    }
}

class FilterManager {
    constructor() {
        this._filters = {};
        this._id = 0;
    }

    def(func, defaultOptions = {}) {
        const name = defaultOptions.name || `filter_${this._id}`;
        if (!defaultOptions.name) this._id++;

        try {
            Object.defineProperty(this, name, {
                get: () => this._filters[name]
            });
        } catch (e) {
        }

        return this._filters[name] = new FilterDef(func, Object.assign({name}, defaultOptions));
    }
}

const filter = new FilterManager();


let loopOperators = [], loopActive = false;

function sleep(time) {
    ditty.tick += time;
}

function loop(func, options = {}) {
    return ditty.addLoop(new LiveLoop(func, options));
}

class LiveLoop {
    constructor(func, options = {}) {
        this._options = new Options(Object.assign({
            amp: 1,
            pan: 0,
            sync: -1,
            cutoff: .5,
            name: `loop_${Object.keys(ditty.loops).length}`
        }, options));

        this.children = [];

        this._filters = [];
        this._counter = 0;
        this._gen = isClass(func) ? (this._gen = new func(this._options), this._gen.process.bind(this._gen)) : func;

        // end tick and operators of current loop
        this._endTick = -1;
        this._operators = [];
        this._operatorIndex = 0;

        this._out = {
            nodeType: NODE_TYPE_OUT
        }
    }

    get options() {
        return this._options.proxy;
    }

    get name() {
        return this._options.name;
    }

    init() {
        this._filters.forEach(filter => filter.init());
    }

    runInContext(func, ...args) {
        const oldOperators = [...loopOperators];
        loopOperators = [];
        loopActive = true;

        let startTick = ditty.tick;

        func(...args, this._options);

        this.duration = ditty.tick - startTick;
        ditty.tick = startTick;

        const ret = [...loopOperators];

        loopActive = false;
        loopOperators = oldOperators;

        return ret;
    }

    evalLoop() {
        if (ditty.tick >= this._endTick) {
            // fill new loop
            this._operators = this.runInContext(this._gen, this._counter);

            this._endTick = Math.round((this._options.sync > 0 ? Math.floor(ditty.tick / this._options.sync + 1) * this._options.sync : ditty.tick + this.duration) * 1e3) / 1e3;

            if (this._endTick === ditty.tick) {
                debug.warn(this.name, 'has no duration. Use sleep() or set sync option.');
            }

            this._operators.sort((a, b) => a.startTick - b.startTick);
            this._operatorIndex = 0;
            this._counter++;
        }

        for (const l = this._operators.length; this._operatorIndex < l && this._operators[this._operatorIndex].startTick < ditty.tick; this._operatorIndex++) {
            const elem = this._operators[this._operatorIndex];
            switch (elem.type) {
                case LOOP_OPERATOR_SYNTH:
                    this.children.push(elem.synth);
                    // ditty.log(`♪ tick: ${ditty.tick.toFixed(2)}, note: ${elem.synth.note} (${this.name}.${elem.synth.name})`);
                    ditty.postMessage({type: MSG_NOTE_PLAYED, note: elem.synth.note, tick: ditty.tick, loop: this.name, synth: elem.synth.name, duration: elem.synth.env.duration});
                    break;
                case LOOP_OPERATOR_OPTION:
                    elem.options[elem.key] = elem.value;
                    break;
            }
        }

        return true;
    }

    process() {
        if (!this.evalLoop()) {
            return false;
        }

        const input = [0, 0];

        this.children = this.children.filter(child => {
            const value = child.process();
            if (value) {
                input[0] += value[0];
                input[1] += value[1];
                return true;
            }
        });

        filterPanAmp(input, this._options.pan, this._options.amp);

        this._filters.forEach(f => f.process(input));

        return input;
    }

    connect(filter) {
        if (this._out.nodeType === NODE_TYPE_FILTER) {
            throw(`${this.name} can't connect - already connected to shared filter.`);
        }
        if (filter.runAs === RUN_AS_WORKER) {
            this._out.nodeType = NODE_TYPE_FILTER;
            this._out.name = filter.name;
        } else {
            this._filters.push(filter);
        }
        return this;
    }

    structure() {
        return {
            name: this.name, nodeType: NODE_TYPE_LOOP, runAs: RUN_AS_WORKER, out: this._out
        };
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

class DittyWorker extends Ditty {
    constructor() {
        super();

        this._node = undefined;
        this._index = 0;
        this.port = self;
    }

    postStructure() {
        this.tick = 0;
        this.postMessage({type: MSG_INIT, success: true, structure: ditty.structure});
    }

    onmessage(data) {
        switch (data.type) {
            case MSG_INIT:
                this._node = undefined;
                this._index = 0;
                this._port = data.port;
                this._buffers = [];
                this._nodeType = data.nodeType;
                this._audioBus = data.in.length > 0 ? new Audiobus().initInput(data, () => this.fillBuffers()) : undefined;

                if (data.nodeType === NODE_TYPE_LOOP) {
                    this._node = this.loops[data.name];
                } else if (data.nodeType === NODE_TYPE_FILTER) {
                    this._node = this.filters[data.name];
                }
                this._node.init();

                this.setVars(data.vars);

                this._buffers.push(...data.buffers);
                this.fillBuffers();

                // set vars again, because input variables can be defined inside a loop
                this.setVars(data.vars);

                this._port.onmessage = (e) => {
                    this._buffers.push(...e.data.buffers);
                    this.fillBuffers();
                };

                this._port.start();

                break;
            case MSG_SET_VARS:
                this.setVars(data.vars);
                break;
            case MSG_SET_AMP:
                if (this._audioBus) {
                    this._audioBus.setAmp(data.amp);
                }
                break;
            case MSG_ANALYZE_STRUCTURE:
                this.postStructure();
                break;
        }
    }

    fillBuffers() {
        while (this._buffers.length && (!this._audioBus || this._audioBus.dataAvailable())) {
            const buffer = this._buffers.pop();
            this.fillBuffer(buffer);
        }
    }

    fillBuffer(buffer) {
        buffer.index = this._index;
        const data = buffer.data;

        if (this._audioBus && this._audioBus.dataAvailable()) {
            this._audioBus.fillBuffer(data);
        }

        if (this._node) {
            let index = 0;

            if (this._nodeType === NODE_TYPE_FILTER) {
                for (let i = 0; i < BUFFER_LENGTH; i++) {
                    const res = [data[index], data[index + 1]];

                    this._node.process(res);

                    data[index++] = res[0];
                    data[index++] = res[1];

                    this.time += this.dt;
                    this.tick += this.dtick;
                }
            } else {
                for (let i = 0; i < BUFFER_LENGTH; i++) {
                    const res = this._node.process();
                    data[index++] = res[0];
                    data[index++] = res[1];

                    this.time += this.dt;
                    this.tick += this.dtick;
                }
            }
        }

        this._index++;
        this._port.postMessage(buffer, [buffer.data.buffer]);

        if (debug.data.input || this._audioBus) {
            this.postMessage({
                type: MSG_UPDATE, bpm: this.bpm, sampleRate: this.sampleRate, debug: debug.data,
                amp: this._audioBus ? this._audioBus.amp : {}
            }, Object.values(debug.data.probes).map(p => p.data.buffer));
            debug.reset();
        }
    }
}

ditty = new DittyWorker();

onmessage = (e) => {
    if (e.data.code) Function(e.data.code)();
    ditty.onmessage(e.data);
}


