// Interstellar trailer edit: shot order and lengths on the bar grid of m_horizon (2.25 s bars, beat 0.75 s), music section and output format; pure data shared by the stage page and the recorder.
export const EDIT = {
  fps: 30,
  width: 1920,
  height: 1080,
  kbps: 24000,
  music: { file: 'assets/audio/music/m_horizon.mp3', from: 101.95, fadeIn: 1.2, fadeOut: 2.6, lufs: -16, peak: -1.5 },
  shots: [
    ['wake', 3.0],
    ['corridor', 2.25],
    ['spine', 1.5],
    ['cockpit', 2.25],
    ['undock', 2.25],
    ['orbit', 2.25],
    ['wade', 3.75],
    ['wave', 3.75],
    ['reveal', 3.75],
    ['dive', 3.0],
    ['tesseract', 3.0],
  ],
  accents: [6.75, 9.0, 11.25, 13.5, 15.75, 17.26, 18.0, 20.25, 21.0, 22.5, 24.75, 27.0, 27.75, 29.25],
};

export function timeline(fps = EDIT.fps) {
  let t = 0;
  return EDIT.shots.map(([id, dur], i) => {
    const t0 = t, t1 = t + dur;
    t = t1;
    const f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
    return { id, index: i, t0, t1, f0, f1, frames: f1 - f0, first: i === 0, last: i === EDIT.shots.length - 1 };
  });
}

export function shotInfo(id, fps = EDIT.fps) { return timeline(fps).find(s => s.id === id) || null; }
