# Gratis barnaktiviteter i Stockholm

Privat övningsprojekt. Hämtar daterade gratisevenemang för barn, listar dem per dag och visar dem på karta.

## Kör

Kräver Node 20 eller senare, inga beroenden.

```
node hamta/index.mjs        # skriver data/evenemang.json
npx serve webb              # eller valfri statisk server
```

Öppna inte `webb/index.html` direkt från filsystemet, `fetch` mot JSON-filen blockeras då av webbläsaren. Kör en statisk server.

## Struktur

```
hamta/alder.mjs       tolkning av ålder och pris, samt urvalsreglerna
hamta/bibliotek.mjs   Stockholms stadsbibliotek, GraphQL
hamta/kultur.mjs      kultur.stockholm, HTML
hamta/platser.json    koordinater per bibliotek, ska fyllas i manuellt
hamta/index.mjs       kör allt, skriver data/evenemang.json
webb/index.html       lista per dag, filter, kartflik
```

## Urvalsregler

- Ålder: allt med undre gräns 7 år eller lägre kommer med, inklusive oklara fall. Finare filtrering sker i gränssnittet.
- Pris: gratis eller högst 50 kronor per person.
- Okänt pris är egen status. Det visas aldrig som gratis och är dolt som standard.

## Källor

**Stockholms stadsbibliotek.** GraphQL på `https://biblioteket.stockholm.se/graphql`, query `eventSearch`. Öppet, ingen nyckel. Odokumenterat internt API, fältnamnen är kartlagda genom att prova 2026-09-09. Introspection är avstängd. Det kan sluta fungera utan förvarning, därför kastar hämtaren ett tydligt fel i stället för att tyst leverera noll rader.

**kultur.stockholm.** Ingen API. HTML skrapas från `kultur.stockholm/kalendarium/?t=event&c=279`, där `c=279` är kategorin Barn och familj. Markupen som parsas är `div.card-inner` med `h4.card-title` och `<time datetime="ÅÅÅÅ-MM-DD">`. Ändrar de sin mall slutar parsern hitta poster.

## Kvar att göra

1. **Fyll i `hamta/platser.json`.** Alla 38 bibliotek ligger där med `lat` och `lon` satta till null. Utan koordinater fungerar listan men kartan är tom. Slå upp dem en gång, till exempel via OpenStreetMap, och fyll i. Jag har medvetet inte gissat koordinater.
2. Koordinater för kultur.stockholms platser. Plats anges där i fritext, "Gamla stan", så det blir ungefärligt eller inget alls.
3. Ålder för kultur.stockholm hämtas i dag bara ur titeln. Åldern står i brödtexten på detaljsidan, så ett extra anrop per evenemang behövs för att få den.
4. Stadsdel per arrangör, för filtret som ännu inte finns.
5. Ett modellsteg som ersätter regeltolkningen i `alder.mjs` om reglerna visar sig för trubbiga.

## Drift

`.github/workflows/hamta.yml` kör hämtaren varje morgon klockan 06 svensk tid och committar `data/evenemang.json` om något ändrats. Statisk sida, ingen server, ingen databas.
