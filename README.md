# Interstellar

A first-person browser game in eight chapters: waking alone on a spinning ship, a flight to a water world where every second costs a month, the years that pass while you are gone, a fall into a black hole, and a lattice built from your own recorded past.

Play: https://interstellar.gzowo.fun

This is a fan-made, non-commercial project. It is not affiliated with or endorsed by the makers of the film that inspired it. The story, characters, text, models and code are original; nothing from the film (footage, stills, dialogue, music) is included.

## Playing together

Two pilots can fly the whole journey together. One chooses **host a second pilot** on the start screen and gets a five-character code, or copies an invite link; the other opens the site, chooses **join as second pilot** and types the code. No accounts.

The two browsers find each other through a small room in a Firebase Realtime Database and then send their positions to each other directly over WebRTC, falling back to the database when a direct connection is not possible. As in any peer-to-peer game, the other pilot's browser learns your network address. A room holds only the state of that session and is removed when both pilots leave.

## Running it

No build step. Serve the folder with any static server and open `index.html` in a recent Chrome on a computer with a dedicated graphics card. Keyboard and mouse or a gamepad; the controls screen is in the pause menu.

## Built with

- [three.js](https://threejs.org) r187 (MIT), vendored in `vendor/three`.
- Plain ES modules, no dependencies to install.
- Co-op pairing: Firebase Realtime Database through its REST interface (no SDK), WebRTC data channels with public STUN servers.

## Credits and licences

- Music: Scott Buckley, CC BY 4.0 (https://www.scottbuckley.com.au). Track list and sources in `assets/licenses/audio.md`.
- Sound effects: freesound.org contributors, CC0 1.0 unless listed otherwise, and NASA public-domain recordings. Every file is listed in `assets/licenses/audio.md`.
- Typeface: B612 Mono, SIL Open Font License (`assets/fonts/OFL.txt`).
- Display graphics notes: `assets/licenses/displays.md`.

Each `vN` folder is a frozen copy of an earlier release.
