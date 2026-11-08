# NFC Skanner

En enkel webbapp (PWA) som läser och skriver NFC-taggar direkt i Chrome på
Android.

- **Streckkod-fliken** (standardvyn): kontinuerlig skanning, extraherar
  automatiskt t.ex. de 11 första siffrorna ur taggens data (konfigurerbart:
  hur många tecken, hoppa över tecken, endast siffror eller inte, vilken
  post på taggen) och kopierar koden till urklipp direkt när du skannar.
  Du klistrar sedan in (långtryck → Klistra in) i vilket fält som helst,
  på vilken webbsida eller app som helst.
- **Läs (avancerat)-fliken**: fritt utdataformat för hela taggens innehåll
  — text, hex, decimal, Base64, binärt eller full JSON-struktur.
- **Skriv-fliken**: skriv text eller URL till en tom/skrivbar tagg.

### Varför bara "kopiera", inte automatisk inklistring på en godtycklig sida?

Webbläsare tillåter av säkerhetsskäl inte att en webbsida skriver text
direkt i fält på en *annan* webbsida (annan origin). Det är samma
begränsning som gör att ingen webbsida kan läsa vad du skriver på en
annan flik. Genom att kopiera koden till urklipp automatiskt vid varje
skanning kommer du väldigt nära "automatiskt" — det enda extra steget är
ett långtryck → Klistra in i fältet du vill fylla i, vilket fungerar
överallt (vilken webbsida eller app som helst), till skillnad från en
lösning skräddarsydd för en specifik sida.

Om du vill ha det helt automatiskt (ingen inklistring alls) för en
specifik webbsida du själv äger/kontrollerar (t.ex. en egen intern sida)
går det att bygga in skanningen direkt i den sidan istället — säg till så
tittar vi på det.

## Varför måste den läggas upp på nätet?

Webbläsarens NFC-funktion (Web NFC API) kräver en "secure context" — en
riktig `https://`-adress. Den fungerar inte om du bara öppnar filen lokalt
(`file://...`), och den fungerar bara i **Chrome på Android** (inte iPhone,
inte Firefox/Samsung Internet).

## Snabbaste sättet att lägga upp den: GitHub Pages (gratis)

1. Skapa ett gratis konto på https://github.com om du inte redan har ett.
2. Skapa ett nytt repository, t.ex. `nfc-skanner` (publikt, det är gratis
   och räcker gott för det här).
3. Ladda upp alla filer i den här mappen (`index.html`, `app.js`,
   `styles.css`, `manifest.json`, `service-worker.js`, mappen `icons/`)
   till repot — antingen via "Add file → Upload files" i webbläsaren, eller
   via git:
   ```
   git init
   git add .
   git commit -m "NFC skanner"
   git branch -M main
   git remote add origin https://github.com/DITT-ANVANDARNAMN/nfc-skanner.git
   git push -u origin main
   ```
4. Gå till repots **Settings → Pages**, välj "Deploy from a branch",
   branch `main`, mapp `/ (root)`, spara.
5. Efter någon minut får du en adress typ:
   `https://DITT-ANVANDARNAMN.github.io/nfc-skanner/`
6. Öppna den adressen i **Chrome på din Android-telefon**.
7. Tryck på menyn (⋮) → "Lägg till på startskärmen" / "Installera app" så
   får du en app-ikon precis som en vanlig app.

### Alternativ: Netlify Drop (ännu snabbare, inget konto krävs för test)

Gå till https://app.netlify.com/drop i datorns webbläsare och dra in hela
mappen. Du får direkt en `https://...netlify.app`-adress att öppna på
telefonen. (Ett gratiskonto behövs om du vill att adressen ska vara
permanent.)

## Använda appen

- **Streckkod-fliken**: ställ in källa/antal tecken/hoppa över/endast
  siffror en gång, tryck "Starta kontinuerlig skanning" och håll taggar
  mot telefonen — en efter en, ingen ny knapptryckning behövs mellan
  skanningarna. Koden visas stort och kopieras automatiskt till urklipp;
  det finns även en "Kopiera"-knapp och en lista med de senaste 10
  skanningarna om du missade en.
- **Läs (avancerat)-fliken**: välj utdataformat i listan (auto/text/hex/
  decimal/Base64/binärt/JSON) och tryck "Starta skanning" för att se hela
  taggens råa innehåll, poster och serienummer.
- **Skriv-fliken**: skriv text eller en URL och skriv den till en tom/
  skrivbar tagg.
- **Historik-fliken**: se tidigare skanningar, exportera allt som JSON
  eller CSV, eller rensa historiken. Historiken sparas lokalt i
  telefonens webbläsare (localStorage) — den skickas aldrig någonstans.

## Om skanningen inte hittar någon kod

Vissa RFID-taggar som används i bibliotek/hyllsystem är inte formaterade
enligt NDEF-standarden (som webbläsarens Web NFC-API kräver) utan
använder rå ISO 15693/ISO 28560-data. Om "Streckkod"-fliken visar "—"
eller ett tomt resultat trots att taggen känns av: testa "Läs
(avancerat)" och se om någon post över huvud taget visas. Visas ingenting
alls där heller går taggen troligen inte att läsa via en vanlig
webbläsare, och det behövs i så fall en annan lösning (t.ex. en app med
lägre nivås NFC-åtkomst). Säg till så felsöker vi vidare.

## Begränsningar att känna till

- Fungerar bara i Chrome (eller andra Chromium-baserade webbläsare) på
  Android — inte iPhone, inte skrivbordsdatorer.
- Chrome frågar om NFC-behörighet första gången du skannar/skriver.
  NFC måste vara påslaget i telefonens systeminställningar.
- Automatisk urklipp-kopiering vid skanning kan i vissa fall blockeras av
  webbläsaren (den kräver ibland en direkt knapptryckning) — därför finns
  alltid en manuell "Kopiera"-knapp som garanterat fungerar.
- Det här är inte en app i Google Play — det är en installerbar webbsida
  (PWA). Den fungerar och känns som en app, men distribueras inte via
  Play Store.

---

## Solitaire

I mappen [`solitaire/`](solitaire/) finns ett fristående Klondike-solitaire
(egen grafik) som fungerar med mus och touch, på mobil och dator. Det
publiceras via GitHub Pages på `/NFC/solitaire/`.

- Inga cookies, ingen spårning och inga externa resurser (typsnitt, CDN m.m.).
- Inställningar, statistik och pågående spel sparas i webbläsarens
  `localStorage` **bara** om spelaren trycker på "Godkänn" i notisen. Det kan
  när som helst stängas av och raderas i menyn.
- Dra 1 eller dra 3 kort väljs i menyn.
