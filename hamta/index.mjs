// Kör alla källor och skriver data/evenemang.json.
// Kör: node hamta/index.mjs

import { writeFile } from 'node:fs/promises';
import { hamtaBibliotek } from './bibliotek.mjs';
import { hamtaKultur } from './kultur.mjs';
import { prisPasserar } from './alder.mjs';

const idag = new Date().toISOString().slice(0, 10);

async function forsok(namn, fn) {
  try {
    const rad = await fn();
    console.log(`${namn}: ${rad.length} evenemang`);
    return { rad, fel: null };
  } catch (e) {
    console.error(`${namn} misslyckades: ${e.message}`);
    return { rad: [], fel: e.message };
  }
}

const bibliotek = await forsok('Stadsbiblioteket', () => hamtaBibliotek(idag));
const kultur = await forsok('kultur.stockholm', () => hamtaKultur());

const alla = [...bibliotek.rad, ...kultur.rad]
  .filter(e => e.datum >= idag)
  .filter(e => prisPasserar(e.pris))
  .sort((a, b) => (a.datum + (a.starttid || '')).localeCompare(b.datum + (b.starttid || '')));

const utan_koordinat = alla.filter(e => e.lat === null).length;

const ut = {
  uppdaterad: new Date().toISOString(),
  antal: alla.length,
  kallor: {
    'Stockholms stadsbibliotek': { antal: bibliotek.rad.length, fel: bibliotek.fel },
    'kultur.stockholm': { antal: kultur.rad.length, fel: kultur.fel }
  },
  utan_koordinat,
  evenemang: alla
};

await writeFile(new URL('../data/evenemang.json', import.meta.url), JSON.stringify(ut, null, 2));
console.log(`Skrev ${alla.length} evenemang. ${utan_koordinat} saknar koordinater.`);

// Om båda källorna fallerar är något större fel, låt körningen fallera synligt.
if (bibliotek.fel && kultur.fel) process.exit(1);
