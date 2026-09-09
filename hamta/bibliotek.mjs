// Hämtar barnevenemang från Stockholms stadsbiblioteks GraphQL-API.
// Odokumenterat internt API. Fältnamnen är kartlagda genom att prova, 2026-09-09.
// Kan ändras utan förvarning, därför felhantering och tydliga fel.

import { tolkaAlder, alderPasserar, tolkaPris } from './alder.mjs';
import platser from './platser.json' with { type: 'json' };

const ENDPOINT = 'https://biblioteket.stockholm.se/graphql';

const QUERY = `query($ta:[String],$s:String,$size:Int,$from:Int){
  eventSearch(targetAudiences:$ta,startDate:$s,size:$size,from:$from){
    results
    events{
      id title eventSlugId
      description{ preamble }
      image{ url }
      library location externalEventLink
      dateTime{ startDate stopDate startTime stopTime }
      targetAudiences category subcategory audienceInformation
      bookable bookingStatus canceled recurring
    }
  }
}`;

const MANADER = ['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];

// "lördag 12 september 2026" -> "2026-09-12"
export function tolkaSvensktDatum(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().match(/(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/);
  if (!m) return null;
  const manad = MANADER.indexOf(m[2]);
  if (manad < 0) return null;
  return `${m[3]}-${String(manad + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}

async function fraga(variables) {
  const svar = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables })
  });
  if (!svar.ok) throw new Error(`Biblioteks-API svarade ${svar.status}. Kontrollera om API:et ändrats.`);
  const json = await svar.json();
  if (json.errors) throw new Error('Biblioteks-API gav fel: ' + JSON.stringify(json.errors).slice(0, 300));
  if (!json.data || !json.data.eventSearch) throw new Error('Oväntat svar från biblioteks-API. Fältnamnen kan ha ändrats.');
  return json.data.eventSearch;
}

export async function hamtaBibliotek(franDatum = new Date().toISOString().slice(0, 10)) {
  const sidstorlek = 200;
  let from = 0;
  let totalt = null;
  const rada = [];

  while (totalt === null || from < totalt) {
    const sida = await fraga({ ta: ['Barn'], s: franDatum, size: sidstorlek, from });
    totalt = sida.results;
    if (!sida.events.length) break;
    rada.push(...sida.events);
    from += sidstorlek;
    if (from > 5000) break; // skydd mot oändlig loop
  }

  return rada
    .filter(e => !e.canceled)
    .map(e => {
      const fritext = [e.audienceInformation, e.description?.preamble, e.title].filter(Boolean).join(' ');
      const alder = tolkaAlder(fritext, e.category);
      const plats = platser[e.library] || {};
      return {
        id: 'bib-' + e.id,
        titel: (e.title || '').trim(),
        beskrivning: (e.description?.preamble || '').trim(),
        arrangor: e.library,
        plats: e.location || e.library,
        stadsdel: plats.stadsdel || null,
        lat: plats.lat ?? null,
        lon: plats.lon ?? null,
        datum: tolkaSvensktDatum(e.dateTime?.startDate),
        slutdatum: tolkaSvensktDatum(e.dateTime?.stopDate),
        starttid: e.dateTime?.startTime || null,
        sluttid: e.dateTime?.stopTime || null,
        aterkommande: !!e.recurring,
        kraverBokning: !!e.bookable,
        alder,
        pris: tolkaPris('Gratis'), // biblioteksevenemang är gratis, sätts per källa
        kategori: e.category || null,
        underkategori: e.subcategory || null,
        bild: e.image?.url || null,
        lank: e.externalEventLink || `https://biblioteket.stockholm.se/evenemang/${e.eventSlugId}`,
        kalla: 'Stockholms stadsbibliotek'
      };
    })
    .filter(e => e.datum && alderPasserar(e.alder));
}
