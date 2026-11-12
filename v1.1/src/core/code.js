// Interstellar room codes: five characters from an alphabet without look-alikes, made at random for a host and cleaned from whatever a guest types.
export const CODE = { length: 5, letters: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' };

export function newCode() {
  const n = CODE.letters.length, r = new Uint32Array(CODE.length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(r);
  else for (let i = 0; i < r.length; i++) r[i] = Math.floor(Math.random() * 2 ** 32);
  return Array.from(r, v => CODE.letters[v % n]).join('');
}

export const cleanCode = s => [...String(s ?? '').toUpperCase()].filter(c => CODE.letters.includes(c)).join('').slice(0, CODE.length);
