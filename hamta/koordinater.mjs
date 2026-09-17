// Fyller koordinater i platser.json och platser-kultur.json.
// Körs för hand vid behov, INTE från morgonjobbet:
//
//   node hamta/koordinater.mjs
//
// Två källor, båda uppslag i OpenStreetMap, ingen gissning:
//   1. Overpass, alla amenity=library i Stockholms kommun, matchas på namn.
//   2. Nominatim, fritextsökning för det Overpass missar och för kulturplatser.
//
// Bara poster där lat är null fylls i. Har du rättat en koordinat för hand
// rörs den aldrig. Granska alltid `git diff` efteråt, namnmatchning kan slå fel.

import { readFile, writeFile } from 'node:fs/promises';

const UA = 'gratis-barnaktiviteter (privat övningsprojekt)';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Overpass: alla bibliotek inom Stockholms kommun.
const FRAGA = `[out:json][timeout:60];
area["name"="Stockholms kommun"]["admin_level"="7"]->.a;
(node["amenity"="library"](area.a);way["amenity"="library"](area.a););
out center tags;`;

const paus = ms => new Promise(r => setTimeout(r, ms));

// Namn till jämförbar form. "Östermalms bibliotek, Fältöversten" och
// "Östermalms bibliotek" ska bli samma sak.
function normalisera(namn) {
  return String(namn)
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(/bibliotek(et)?s?/g, ' ')
    .replace(/\bstads\b/g, ' ')
    .replace(/[^a-zåäö0-9]+/g, '');
}

// Publika Overpass och Nominatim svarar ibland 429 eller 504 när de är
// belastade. Då väntar vi och försöker igen i stället för att avbryta.
const TILLFALLIGA = [429, 502, 503, 504];

async function hamtaJson(url, { metod = 'GET', body = null, forsok = 4 } = {}) {
  for (let n = 1; ; n++) {
    let svar;
    try {
      svar = await fetch(url, {
        method: metod,
        body,
        headers: { 'user-agent': UA, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        signal: AbortSignal.timeout(120_000)
      });
    } catch (e) {
      if (n >= forsok) throw new Error(`${url.split('?')[0]}: ${e.message}`);
      await paus(n * 5000);
      continue;
    }
    if (svar.ok) return svar.json();
    if (!TILLFALLIGA.includes(svar.status) || n >= forsok) {
      throw new Error(`${url.split('?')[0]} svarade ${svar.status}`);
    }
    console.log(`    ${svar.status} från servern, väntar ${n * 5} s och försöker igen (${n}/${forsok - 1})`);
    await paus(n * 5000);
  }
}

// Alla bibliotekspunkter i OSM, som { normaliserat namn: { namn, lat, lon } }.
async function hamtaBibliotekspunkter() {
  const data = await hamtaJson(OVERPASS, { metod: 'POST', body: 'data=' + encodeURIComponent(FRAGA) });
  const punkter = new Map();
  for (const e of data.elements || []) {
    const namn = e.tags?.name;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!namn || lat == null || lon == null) continue;
    punkter.set(normalisera(namn), { namn, lat, lon });
  }
  return punkter;
}

// Exakt normaliserad träff, annars en entydig delsträngsträff. Är flera
// möjliga lämnas det till handpåläggning, hellre tomt än fel punkt.
function matcha(nyckel, punkter) {
  const n = normalisera(nyckel);
  if (!n) return null;
  if (punkter.has(n)) return punkter.get(n);
  const kandidater = [...punkter].filter(([k]) => k.includes(n) || n.includes(k)).map(([, v]) => v);
  return kandidater.length === 1 ? kandidater[0] : null;
}

// Stockholms stad med marginal. Träffar utanför rutan förkastas, annars
// hittar fritextsökningen gärna en likadan gata i en annan kommun.
const RUTA = { minLon: 17.75, minLat: 59.15, maxLon: 18.35, maxLat: 59.45 };

// Vad en träff pekar på. Stadsdelar först: heter platsen samma sak som ett
// administrativt område är det nästan alltid området som avses, inte en
// butik som råkar dela namn. Sedan byggnader och verksamheter. Sist allt
// annat, tunnelbanestationer och liknande som bara råkade ligga nära.
function traffKlass(t) {
  if (['place', 'boundary'].includes(t.category)) return 0;
  if (['amenity', 'tourism', 'building', 'leisure', 'shop', 'office', 'historic'].includes(t.category)) return 1;
  return 2;
}

// Ungefärlig, alltså en yta med en mittpunkt snarare än en byggnad.
const arUngefarlig = t => traffKlass(t) !== 1;

const rensa = s => String(s).toLowerCase().replace(/[^a-zåäö0-9]+/g, '');

// Heter träffen verkligen det vi sökte? Nominatim returnerar gärna grannen
// när den inte hittar rätt, så antingen ska husnumret stämma eller så ska
// första ledet i namnet göra det.
function namnStammer(träff, fraga) {
  // Slutar frågan med ett husnummer är det en adress. Stämmer numret har
  // Nominatim redan gjort jobbet, namnet på huset spelar ingen roll.
  const husnr = String(fraga).match(/\b(\d{1,4}\s*[a-z]?)\s*$/i);
  if (husnr && rensa(träff.address?.house_number || '') === rensa(husnr[1])) return true;

  const forsta = rensa(träff.display_name.split(',')[0]);
  const sokt = rensa(fraga);
  if (!forsta || !sokt) return false;
  if (forsta === sokt || forsta.includes(sokt) || sokt.includes(forsta)) return true;

  // "Vasastan" i datan, "Vasastaden" i OSM. Bestämd form och liknande
  // ändelseskillnader tillåts genom att jämföra den gemensamma inledningen.
  let i = 0;
  while (i < forsta.length && i < sokt.length && forsta[i] === sokt[i]) i++;
  return i >= 5 && i / Math.min(forsta.length, sokt.length) >= 0.8;
}

// Ett anrop mot Nominatim, max ett per sekund enligt deras användarvillkor.
async function sok(text) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(text)}&format=jsonv2&limit=8&countrycodes=se&addressdetails=1`
    + `&viewbox=${RUTA.minLon},${RUTA.minLat},${RUTA.maxLon},${RUTA.maxLat}&bounded=1`;
  const träffar = await hamtaJson(url);
  await paus(1100);
  return träffar
    .filter(t => +t.lat >= RUTA.minLat && +t.lat <= RUTA.maxLat && +t.lon >= RUTA.minLon && +t.lon <= RUTA.maxLon)
    .sort((a, b) => traffKlass(a) - traffKlass(b));
}

const kort = t => t.display_name.split(',').slice(0, 3).join(',').trim();

// Slår upp en plats.
//
// Bara hela nyckeln får fylla i automatiskt, och bara om namnet stämmer.
// "Stadsmuseet, Slussen" och "Lava, Kulturhuset" ger noll träffar i sin
// helhet, och vilken del som är den riktiga platsen går inte att avgöra
// maskinellt: för den första är det ledet före kommat, för den andra ledet
// efter. Att välja åt användaren vore att gissa. Delarna slås ändå upp, men
// bara för att kunna föreslå kandidater att välja mellan för hand.
async function slaUppFritext(nyckel) {
  const heltraffar = (await sok(nyckel + ', Stockholm')).filter(t => namnStammer(t, nyckel));
  if (heltraffar.length) {
    const t = heltraffar[0];
    return { sakert: { namn: kort(t), lat: +t.lat, lon: +t.lon, ungefarlig: arUngefarlig(t) } };
  }

  const delar = nyckel.split(',').map(d => d.trim()).filter(d => d.length > 2 && d !== nyckel);
  const forslag = [];
  for (const del of delar) {
    for (const t of (await sok(del + ', Stockholm')).filter(x => namnStammer(x, del)).slice(0, 2)) {
      forslag.push({ del, namn: kort(t), lat: +t.lat, lon: +t.lon, ungefarlig: arUngefarlig(t) });
    }
  }
  return { forslag };
}

// Bibliotekens egen sajt har en sida per filial med gatuadressen. Den är mer
// att lita på än fritextsökning på filialnamnet, och används för de bibliotek
// OSM saknar som egen punkt. Samma sajt som eventhämtaren, ingen ny källa.
async function adressFranBiblioteket(namn) {
  const slug = namn
    .toLowerCase()
    .replace(/,.*$/, '')
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  let svar;
  try {
    svar = await fetch(`https://biblioteket.stockholm.se/bibliotek/${slug}`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    return null;
  }
  if (!svar.ok) return null;
  const träff = (await svar.text()).match(/"address"\s*:\s*"([^"]+)"/);
  if (!träff) return null;
  return träff[1].replace(/\s*\(Google Maps\)\s*$/i, '').trim() || null;
}

async function lasJson(fil) {
  return JSON.parse(await readFile(new URL(fil, import.meta.url), 'utf8'));
}

async function skrivJson(fil, data) {
  const sorterad = Object.fromEntries(Object.keys(data).sort((a, b) => a.localeCompare(b, 'sv')).map(k => [k, data[k]]));
  await writeFile(new URL(fil, import.meta.url), JSON.stringify(sorterad, null, 2) + '\n');
}

function tomPost() {
  return { lat: null, lon: null, stadsdel: null };
}

// Lägger till nycklar som dykt upp i datan men saknas i filen.
function fyllPaNycklar(platser, nycklar, etikett) {
  const nya = nycklar.filter(n => n && !(n in platser));
  for (const n of nya) platser[n] = tomPost();
  if (nya.length) console.log(`  ${nya.length} nya ${etikett} lades till som tomma: ${nya.join(', ')}`);
  return nya;
}

async function main() {
  const evenemang = JSON.parse(await readFile(new URL('../webb/data/evenemang.json', import.meta.url), 'utf8'));
  const rader = evenemang.evenemang || [];

  const bibliotekNamn = [...new Set(rader.filter(e => e.kalla === 'Stockholms stadsbibliotek').map(e => e.arrangor))].sort();
  const kulturNamn = [...new Set(rader.filter(e => e.kalla === 'kultur.stockholm').map(e => e.plats))].sort();

  const bibliotek = await lasJson('./platser.json');
  const kultur = await lasJson('./platser-kultur.json');

  console.log('Stämmer av listorna mot senaste datafilen:');
  fyllPaNycklar(bibliotek, bibliotekNamn, 'bibliotek');
  fyllPaNycklar(kultur, kulturNamn, 'kulturplatser');

  const saknarBib = Object.keys(bibliotek).filter(k => bibliotek[k].lat === null);
  const saknarKul = Object.keys(kultur).filter(k => kultur[k].lat === null);
  console.log(`  ${saknarBib.length} bibliotek och ${saknarKul.length} kulturplatser saknar koordinat\n`);

  const kvar = [];

  if (saknarBib.length) {
    console.log('Overpass, bibliotek i OpenStreetMap:');
    const punkter = await hamtaBibliotekspunkter();
    console.log(`  ${punkter.size} bibliotekspunkter hämtade`);
    for (const nyckel of saknarBib) {
      const träff = matcha(nyckel, punkter);
      if (!träff) { kvar.push(['bibliotek', nyckel]); continue; }
      bibliotek[nyckel] = { ...bibliotek[nyckel], lat: +träff.lat.toFixed(5), lon: +träff.lon.toFixed(5), kalla: `osm: ${träff.namn}` };
      console.log(`  ✓ ${nyckel}  ->  ${träff.namn}`);
    }
    console.log(`  ${saknarBib.length - kvar.length} av ${saknarBib.length} matchade\n`);
  }

  // Bibliotek som OSM saknar: hämta gatuadressen från bibliotekens egen sajt
  // och geokoda den i stället. En adress med husnummer är entydig.
  if (kvar.length) {
    console.log('Gatuadresser från biblioteket.stockholm.se för de OSM missade:');
    for (const post of [...kvar]) {
      const adress = await adressFranBiblioteket(post[1]);
      if (!adress) { console.log(`  ✗ ${post[1]}: ingen sida eller adress`); continue; }
      let svar = null;
      try {
        svar = await slaUppFritext(adress);
      } catch (e) {
        console.log(`  ! ${post[1]}: ${e.message}`);
        continue;
      }
      if (!svar.sakert) { console.log(`  ? ${post[1]}: "${adress}" gav ingen entydig punkt`); continue; }
      const t = svar.sakert;
      bibliotek[post[1]] = {
        ...bibliotek[post[1]],
        lat: +t.lat.toFixed(5),
        lon: +t.lon.toFixed(5),
        kalla: `adress från biblioteket.stockholm.se, "${adress}": ${t.namn}`
      };
      kvar.splice(kvar.indexOf(post), 1);
      console.log(`  ✓ ${post[1]}  ->  ${adress}  ->  ${t.namn}`);
    }
    console.log();
  }

  for (const nyckel of saknarKul) kvar.push(['kultur', nyckel]);

  const attValja = [];

  if (kvar.length) {
    console.log(`Nominatim, fritextsökning för ${kvar.length} platser, ett anrop per sekund:`);
    for (const [typ, nyckel] of kvar) {
      let svar;
      try {
        svar = await slaUppFritext(nyckel);
      } catch (e) {
        console.log(`  ! ${nyckel}: ${e.message}`);
        continue;
      }
      if (svar.sakert) {
        const t = svar.sakert;
        const mal = typ === 'bibliotek' ? bibliotek : kultur;
        mal[nyckel] = {
          ...mal[nyckel],
          lat: +t.lat.toFixed(5),
          lon: +t.lon.toFixed(5),
          kalla: `nominatim${t.ungefarlig ? ', ungefärlig mittpunkt' : ''}: ${t.namn}`
        };
        console.log(`  ${t.ungefarlig ? '~' : '✓'} ${nyckel}  ->  ${t.namn}`);
      } else if (svar.forslag?.length) {
        attValja.push([nyckel, svar.forslag]);
        console.log(`  ? ${nyckel}: ingen entydig träff, ${svar.forslag.length} förslag nedan`);
      } else {
        console.log(`  ✗ ${nyckel}: ingen träff alls, fyll i för hand`);
      }
    }
    console.log();
  }

  await skrivJson('./platser.json', bibliotek);
  await skrivJson('./platser-kultur.json', kultur);

  if (attValja.length) {
    console.log('Att välja mellan för hand. Skriptet vägrar gissa vilken del av');
    console.log('ett namn som "Lava, Kulturhuset" som är den riktiga platsen.\n');
    for (const [nyckel, forslag] of attValja) {
      console.log(`  ${nyckel}`);
      for (const f of forslag) {
        console.log(`      "lat": ${f.lat.toFixed(5)}, "lon": ${f.lon.toFixed(5)}   ${f.namn}${f.ungefarlig ? ' (ungefärlig)' : ''}   [ur "${f.del}"]`);
      }
    }
    console.log();
  }

  const utanBib = Object.values(bibliotek).filter(v => v.lat === null).length;
  const utanKul = Object.values(kultur).filter(v => v.lat === null).length;
  console.log(`Skrev platser.json (${utanBib} kvar utan koordinat) och platser-kultur.json (${utanKul} kvar).`);
  console.log('Granska `git diff` innan du committar. Fältet kalla visar var punkten kom ifrån.');
}

await main();
