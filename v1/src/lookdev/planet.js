// Lookdev: Miller's Planet presets (refs 13, 14, 09, and the dark dot of refs 10 and 12) through the Gargantua lookdev scene.
import run from './gargantua.js';

export default async function (ctx) {
  if (!ctx.params.has('shot')) ctx.params.set('shot', '13');
  return run(ctx);
}
