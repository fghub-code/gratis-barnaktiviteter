# gratis-barnaktiviteter

Privat övningsprojekt. Hittar daterade gratisevenemang för barn ca 2-6 år i Stockholm. Beslut, analys och HANDOVER ligger i `OUTPUT/Gratis-barnaktiviteter` i valvet, inte här.

## Urvalsregler, ändra inte utan att fråga

- Ålder: allt med undre gräns 7 år eller lägre kommer med, inklusive oklara fall. Den grova 7-årsgränsen gallrar i hämtningen, finare filtrering (2-6 mot 0-3) sker i gränssnittet. För kultur.stockholm tolkas åldern ur detaljsidans text, så fler event med hög åldersgräns faller bort där än förr.
- Pris: gratis eller högst 50 kronor per person. Mätning 2026-09-09 visade att barnutbudet i praktiken bara har två nivåer, gratis och 50 kr.
- Okänt pris är egen status. Det får aldrig visas som gratis. Saknad prisuppgift betyder att arrangören inte skrivit ut något. `gratis` sätts bara på explicit formulering, "gratis", "fri entré", "fritt inträde", "kostnadsfri".
- Pris tolkas ur text bara för kultur.stockholm, ur fältet `Pris:`. Biblioteksevenemang är alltid gratis, satt hårdkodat per källa.

## Källor och deras skörhet

**Stockholms stadsbibliotek**, GraphQL på `biblioteket.stockholm.se/graphql`, query `eventSearch`. Öppet, ingen nyckel. Odokumenterat internt API, fältnamnen kartlagda genom att prova 2026-09-09, introspection avstängd. Kan sluta fungera utan förvarning. Hämtaren ska kasta ett tydligt fel, aldrig tyst leverera noll rader.

**kultur.stockholm**, ingen API, HTML skrapas från `/kalendarium/?t=event&c=279`. Markupen som parsas: `div.card-inner`, `h4.card-title`, `<time datetime>`. Deras HTML använder enkla citattecken på vissa attribut och hex-entiteter i titlar, båda hanteras i `avkoda` och regexarna. Ändrar de mallen slutar parsern hitta poster.

Varje kort följs upp med ett anrop till sin detaljsida. Där hämtas kort beskrivning ur `og:description`, som ofta också innehåller åldern i klartext, samt `Plats:` och `Pris:` ur en faktaruta med `<span class="t-bold">`. Saknas något behålls listans värde. Detaljsidor som ger 404 eller är märkta inställda tas bort. Två extra markup-beroenden alltså, og-taggen och faktarutan.

Biblioteksevenemang är alltid gratis, priset sätts hårdkodat per källa.

## Teknik

Node 20, inga beroenden. Ingen databas, ingen server. GitHub Actions kör hämtaren varje morgon, committar `webb/data/evenemang.json` och publicerar `webb/` till GitHub Pages. `webb/` är självförsörjande, sidan läser `data/evenemang.json` relativt sig själv. Frontend är en statisk sida som läser den filen. Leaflet och OpenStreetMap till kartan, ingen nyckel.

`hamta/platser.json` innehåller koordinater per bibliotek och fylls i för hand. `hamta/platser-kultur.json` gör samma sak per kulturplats, nyckeln är exakt den `plats`-sträng hämtaren skrivit. Gissa aldrig koordinater.
