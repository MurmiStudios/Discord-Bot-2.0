# Spec: Discord-Panel 2.0

Stand: 2026-08-30 · Status: **zur Freigabe** · Quelle der Anforderungen: Artifact
„Was das Discord-Panel kann" + interview-me-Protokoll (Abschnitt 2).

---

## 1. Ziel

Ein selbst gehostetes Web-Panel plus Discord-Bot, mit dem automatische Nachrichten,
wiederverwendbare Nachrichten-Vorlagen, Bildvorlagen und Button-Aktionsleisten
eingerichtet und versendet werden — ohne eine Zeile Code oder einen Discord-Befehl.

**Nutzer:** Zunächst ausschliesslich der Betreiber (Owner). Das Rechtesystem ist
trotzdem von Beginn an vierstufig, damit Moderatoren später ohne Umbau dazukommen.

**Warum jetzt:** Wiederkehrende Nachrichten sollen einmal sauber angelegt werden —
inklusive personalisiertem Bild mit Profilbild und Name — und danach automatisch
laufen, statt jedes Mal von Hand getippt zu werden.

**Erfolg in einem Satz:** Repo klonen, ein Setup-Kommando ausführen, über die
Server-IP mit Discord anmelden, Willkommensnachricht + Rollen-Nachrichten +
Rollenregeln + gespeicherte Nachrichten + Bildvorlagen anlegen — und ein
Serverbeitritt löst die richtige DM samt gerendertem Bild aus.

---

## 2. Bestätigte Absicht (Ergebnis interview-me)

| Frage | Bestätigte Antwort |
|---|---|
| Für wen | Erstmal Owner allein; Zugriffsstufen trotzdem bauen |
| Server | Primär einer; Datenmodell muss mehrere können |
| Erster Arbeitsschritt des Nutzers | Automatische Nachrichten einrichten + Vorlagen anlegen |
| Hosting | Oracle Cloud Always Free (ARM64), so wenig Installation wie möglich |
| Installation | Ein Kommando, minimale Befehlsanzahl |
| Erreichbarkeit | Standard IP, Umstieg auf Domain ohne Codeänderung |
| Umfang | Artifact ist Pflicht, vollständig, inkl. Aktionsleisten und Bildvorlagen |
| Zugriffsstufen | Owner = alles; Moderator = alles ausser Panel-Verwaltung; sonst ausgesperrt |
| Später, aber offenhalten | Slash-Befehle, Moderation (Ban/Warn/Timeout/Automod) |

---

## 3. Annahmen, die ich treffe

Wenn eine davon falsch ist, jetzt widersprechen — später kostet es Umbau.

1. Node.js ≥ 22.13 ist auf dem Zielserver installierbar (Empfehlung: 24 LTS).
   `node:sqlite` läuft dort ohne Flag; unter 22.x mit Experimental-Warnung.
2. Der Discord-Bot ist eine eigene Application, die der Betreiber im
   Entwicklerportal selbst anlegt. Das Setup-Skript führt durch die Schritte,
   kann sie aber nicht für ihn ausführen.
3. Es gibt genau eine Betriebsart: Bot und Webserver laufen im **selben**
   Node-Prozess. Kein zweiter Dienst, keine Warteschlangen-Software.
4. Oberfläche, Routen und Meldungen sind auf Deutsch. Keine Mehrsprachigkeit.
5. Der Massenversand läuft im Prozessspeicher mit Fortschritt in der Datenbank;
   ein Neustart mitten im Versand bricht ihn ab und markiert ihn als abgebrochen.
   (Wiederaufnahme nach Neustart ist bewusst nicht Teil dieser Ausbaustufe.)
6. Die Panel-Oberfläche wird nicht öffentlich verlinkt, ist aber über das
   Internet erreichbar und wird entsprechend gehärtet.

---

## 4. Technik-Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Laufzeit | Node.js ≥ 22.13, ESM (`type: module`) | Auf Oracle-ARM64 per Paketquelle verfügbar |
| Datenbank | `node:sqlite` (eingebaut) | Null Installation, eine Datei, ARM64-neutral |
| Webserver | Express 5 | Reines JS, kein nativer Code |
| HTML | Eigene `html`-Tag-Funktion mit Auto-Escaping | Keine Template-Engine als Abhängigkeit, strikte CSP ohne Inline-Code |
| Discord | discord.js v14 | Referenzbibliothek, reines JS |
| Bilder | `@napi-rs/canvas` | Fertige ARM64-Binaries, **keine** System-Bibliotheken (Cairo/Pango entfallen) |
| Upload | `busboy` | Strombasiert, harte Limits vor dem Schreiben |
| Ratenbegrenzung | `express-rate-limit` | Die im Artifact genannten Zahlen 1:1 abbildbar |
| Sitzungen | Eigene Implementierung auf SQLite | Artifact fordert „Sitzung in der Datenbank" ausdrücklich |
| Konfiguration | `--env-file=.env` (eingebaut) | Kein `dotenv` nötig |
| Tests | `node:test` + `node:assert` (eingebaut) | Null Testabhängigkeiten |
| Linting | ESLint (nur devDependency) | Auf dem Server via `npm ci --omit=dev` nicht installiert |

**Laufzeit-Abhängigkeiten gesamt: 5.** discord.js, express, @napi-rs/canvas,
busboy, express-rate-limit.

**Schriftart:** Für die Bild-Erzeugung liegt eine offene Schrift (Inter, SIL OFL)
unter `assets/fonts/` im Repo und wird beim Start registriert. Damit hängt das
Bildergebnis nicht von den Systemschriften des Servers ab — auf einer frisch
aufgesetzten Oracle-VM gibt es faktisch keine.

---

## 5. Kommandos

```
Einrichten:     npm run setup            # interaktiv: .env, Datenbank, Autostart
Starten:        npm start                # Bot + Panel in einem Prozess
Entwicklung:    npm run dev              # mit --watch
Tests:          npm test                 # node --test
Testabdeckung:  npm run test:coverage
Linting:        npm run lint             # eslint .
Linting+Fix:    npm run lint:fix
Datenbank:      npm run db:migrate       # wird von setup und start selbst aufgerufen
Einladungslink: npm run einladung        # gibt die Bot-Einladungs-URL aus
```

Installation auf dem Server, vollständig:

```
git clone <repo> && cd Discord-Bot-2.0
npm ci --omit=dev
npm run setup
```

---

## 6. Projektstruktur

```
src/
  kern/           Konfiguration, .env-Prüfung, Logger, Fehlertypen, Zeit/IDs
  daten/          Schema, Migrationen, Repositories (eine Datei je Tabelle)
  auth/           OAuth2-Ablauf, Sitzungen, CSRF, Zugriffsstufen, Rechteprüfung
  discord/        Bot-Verbindung, Ereignisse, Interaktions-Router, Guild-Cache
    interaktion/  Verteiler: buttons/, modals/, befehle/ (befehle/ bleibt leer)
  web/            Express-App, Middleware, Routen
    seiten/       Eine Datei je Panel-Seite (uebersicht, nachricht, ...)
    html/         html-Tag, Layout, wiederverwendbare Bausteine
    oeffentlich/  Statische Dateien (CSS, wenig JS), mit Hash im Dateinamen
  nachricht/      Nachrichten-Modell: Text, Platzhalter, Embed, Validierung
  bilder/         Bildvorlagen-Renderer und -Modell
  versand/        Empfängerauflösung, Warteschlange, Fortschritt, Fehlerklartext
  aktionen/       Aktionsleisten: Modell, Ausführungskette, Rechteprüfung
  automatik/      Willkommen, Rollen-Nachrichten, Rollenregeln
  protokoll/      Vorgangsprotokoll (Schreiben und Lesen)
tests/
  einheit/        Reine Logik ohne I/O
  integration/    HTTP gegen echten Server, echte SQLite-Datei im Temp
  hilfen/         Testdoppel für Discord, Fixtures
assets/fonts/     Mitgelieferte Schrift für die Bild-Erzeugung
speicher/         Laufzeitdaten: panel.db, uploads/ — nicht in git
docs/             SPEC.md, ADRs, Betriebsanleitung
tasks/            plan.md, todo.md (Schritt 3)
setup.mjs         Interaktives Einrichtungsskript
```

---

## 7. Code-Stil

Deutsch für Fachbegriffe der Domäne (Nachricht, Empfänger, Vorlage, Rollenregel),
Englisch für technische Begriffe, die keine gute deutsche Entsprechung haben
(Router, Middleware, Cache, Request). Keine Umlaute in Bezeichnern.

```js
// src/web/html/html.mjs — Auto-Escaping, damit keine Seite es vergessen kann.
export function html(teile, ...werte) {
  return new SichererText(
    teile.reduce((aus, teil, i) => aus + teil + maskiere(werte[i - 1] ?? ''), '')
  );
}

// src/web/seiten/rollenregeln.mjs — Routen sind schmal, Logik liegt im Modul.
export function registriere(app, { regeln, gilde, protokoll }) {
  app.get('/rollenregeln', verlangt(STUFE.MODERATOR), async (req, res) => {
    res.send(seite({
      titel: 'Rollenregeln',
      inhalt: regelListe(await regeln.alle(req.gildeId), await gilde.rollen(req.gildeId)),
    }));
  });

  app.post('/rollenregeln', verlangt(STUFE.MODERATOR), csrf, async (req, res) => {
    const eingabe = pruefeRegel(req.body);            // wirft Eingabefehler
    if (!eingabe.ok) return res.status(422).send(seiteMitFehlern(eingabe.fehler));
    const regel = await regeln.speichern(req.gildeId, eingabe.wert);
    await protokoll.schreibe('rollenregel.gespeichert', req.nutzer, { regel: regel.id });
    res.redirect(303, '/rollenregeln');
  });
}
```

Regeln:

- **Ausnahmen für Ausnahmefälle, Rückgabewerte für erwartbare Fehler.** Eine
  ungültige Formulareingabe ist kein Ausnahmefall — sie wird als Ergebnis
  zurückgegeben und als Fehlermeldung am Feld angezeigt.
- **Kein `any`-artiges Durchreichen von `req.body`.** Jede Route validiert ihre
  Eingabe in einer benannten Prüffunktion, die einzeln testbar ist.
- **Discord-Aufrufe nur über `src/discord/`.** Kein `client.` ausserhalb dieses
  Verzeichnisses — sonst ist nichts testbar.
- **Jede schreibende Aktion schreibt ins Protokoll.** Ohne Ausnahme.
- **Kein Inline-JavaScript, kein Inline-CSS** in erzeugtem HTML. Die CSP verbietet es.

---

## 8. Teststrategie

Framework: `node:test`, Zusicherungen mit `node:assert/strict`. Keine externen
Testabhängigkeiten.

| Ebene | Was | Wo |
|---|---|---|
| Einheit | Platzhalter-Ersetzung, Zeichenzähler (2000/6000), Validierung, Rechtematrix, Empfängerauflösung, Aktionsketten-Ablauf, Rollenregel-Prüfung | `tests/einheit/` |
| Integration | HTTP gegen den echten Express-Server mit echter SQLite-Datei im Temp-Verzeichnis; Anmeldung, CSRF, Zugriffsstufen, Formularabläufe, Weiterleitungen | `tests/integration/` |
| Bild | Renderer erzeugt PNG, Prüfung auf Grösse, Format und stichprobenartige Pixelfarben | `tests/integration/` |
| Discord | Gegen ein Testdouble in `tests/hilfen/discord-doppel.mjs` — nie gegen echte Discord-Server | `tests/einheit/`, `tests/integration/` |

**Was wir explizit nicht automatisiert testen:** den echten Versand an Discord.
Dafür gibt es die Test-DM-Funktion im Panel und eine Betriebs-Checkliste.

**Abdeckung:** ≥ 80 % Zeilen für `src/`, mit harter Untergrenze **100 %** für
`src/auth/rechte.mjs` und `src/aktionen/kette.mjs` — dort entscheidet sich, ob
jemand etwas darf und ob eine Kette den Server verändert.

**TDD ist verbindlich:** Erst der fehlschlagende Test, dann der Code. Jeder
Arbeitsschritt aus Schritt 3 nennt seinen Test zuerst.

---

## 9. Grenzen

**Immer:**
- Tests und Linting laufen vor jedem Commit; ein Commit mit rotem Test wird nicht gepusht.
- Jede Eingabe wird serverseitig geprüft, auch wenn das Formular sie schon einschränkt.
- Jede Discord-ID (Kanal, Rolle, Nutzer) wird gegen den echten Server geprüft, bevor
  damit etwas geschrieben oder vergeben wird.
- Jede schreibende Aktion landet im Protokoll, mit Nutzer, Zeit und Ergebnis.
- Discord-Fehlercodes werden in Klartext übersetzt, nie roh angezeigt.

**Vorher fragen:**
- Neue Laufzeit-Abhängigkeit über die fünf festgelegten hinaus.
- Änderung am Datenbankschema, nachdem ein Modul freigegeben wurde.
- Jede Erweiterung der Bot-Berechtigungen in der Einladungs-URL.
- Abweichung vom Artifact — auch eine Vereinfachung.

**Niemals:**
- Bot-Token, Client-Secret oder Sitzungsschlüssel ins Repo, in Logs oder ins Protokoll.
- Einen Test überspringen, löschen oder abschwächen, um grün zu werden.
- Inline-`<script>` oder `style="..."` in erzeugtes HTML schreiben.
- Rechteprüfung nur im Formular („Feld ausgeblendet") statt zusätzlich in der Route.
- Massenversand ohne Rückfrage auslösen.

---

## 10. Fähigkeitskarte

| Modul-ID | Verantwortung | Hängt ab von |
|---|---|---|
| `kern` | Konfiguration, `.env`-Prüfung beim Start, Logger, Fehlertypen, Setup-Skript | — |
| `daten` | SQLite-Schema, Migrationen, Repositories, `guild_id`-Trennung | `kern` |
| `auth` | Discord-OAuth2, Sitzungen in der Datenbank, CSRF, vier Zugriffsstufen | `kern`, `daten` |
| `discord` | Bot-Verbindung, Gateway-Ereignisse, Interaktions-Router, Guild-Cache, Rechte-Vorprüfung | `kern`, `daten` |
| `ui` | Layout, Seitenleiste, Seitensuche, Telefon-Layout, Barrierefreiheit, No-JS-Formulare | `kern`, `auth` |
| `nachricht` | Nachrichten-Editor: Text, Platzhalter, Embed, Zeichenzähler, Live-Vorschau | `ui`, `discord` |
| `versand` | Empfängerauflösung, DM- und Kanalversand, Warteschlange mit Fortschritt, Fehlerklartext | `discord`, `nachricht` |
| `bilder` | Bildvorlagen: Renderer, Editor, Upload, Ziehen in der Vorschau | `ui`, `discord`, `daten` |
| `ablage` | Gespeicherte Nachrichten: Liste, Filter, Kopie, Art wechseln, Zielwarnung | `nachricht`, `versand` |
| `automatik` | Willkommensnachricht, Rollen-Nachrichten, Rollenregeln | `discord`, `nachricht`, `versand`, `bilder` |
| `aktionen` | Aktionsleisten: Buttons, Aktionskette, Eingabefenster, Rollen/Kick, Klicksperre | `discord`, `nachricht`, `bilder` |
| `verlauf` | Übersicht, Protokoll, Rückmeldungen mit CSV-Export | `daten`, `ui`, alle schreibenden Module |
| `sicherheit` | CSP, Ratenbegrenzung, Upload-Prüfung, Härtung | querschnittlich in jedem Modul |

**Baureihenfolge:**

```
kern → daten → auth → discord → ui → nachricht → versand → bilder
     → ablage → automatik → aktionen → verlauf
```

`sicherheit` ist kein eigener Bauabschnitt am Ende, sondern Bestandteil jedes
Moduls; der Sicherheitsdurchgang in Schritt 5 prüft das Ergebnis.

Die Reihenfolge folgt bewusst nicht der Navigation im Panel, sondern deiner
Antwort auf F3: `automatik` und `bilder` kommen früh, weil du damit anfängst.
`aktionen` folgt direkt danach, weil deine häufigen Nachrichten sie brauchen.
`verlauf` ist zuletzt, weil es alle anderen Module beobachtet — es kann erst
zeigen, was es vorher nicht gab.

---

## 11. Modul-Spezifikationen

Jeder Punkt ist eine Abnahmebedingung. „braucht Bot" markiert, was ohne
verbundenen Bot nicht prüfbar ist und gegen das Testdouble getestet wird.

### 11.1 `kern`

- `npm run setup` fragt interaktiv ab: Bot-Token, Client-ID, Client-Secret,
  Gilden-ID, Owner-Discord-ID, Erreichbarkeit (IP oder Domain), Port.
- Das Skript schreibt `.env` mit Rechten `600`, erzeugt einen zufälligen
  Sitzungsschlüssel, legt die Datenbank an und führt die Migrationen aus.
- Es gibt die exakte Redirect-URI zum Kopieren aus und die Einladungs-URL
  mit genau den benötigten Bot-Rechten.
- Es bietet an, einen systemd-Dienst zu schreiben und zu aktivieren; lehnt
  man ab, nennt es das Startkommando.
- Ein zweiter Lauf überschreibt vorhandene Werte nicht ungefragt.
- Der Start bricht mit einer benannten Meldung ab, wenn eine Pflichtvariable
  fehlt, wenn `PANEL_URL` mit `https://` beginnt und `TRUST_PROXY` nicht `1` ist,
  oder wenn die Node-Version zu alt ist.
- Konfigurationswerte mit Vorgabe: `DM_MAX_RECIPIENTS=100`, `DM_DELAY_MS=1200`,
  `PORT=3000`, `UPLOAD_MAX_BYTES=5242880`, `UPLOAD_MAX_EDGE=4096`.
- Der Logger schreibt strukturiert nach stdout und maskiert Token und Secrets.

### 11.2 `daten`

- Schema als nummerierte Migrationen; jede läuft genau einmal, festgehalten in
  einer `schema_version`-Tabelle.
- Jede fachliche Tabelle trägt `guild_id`; jede Abfrage in den Repositories
  filtert darauf. Keine Repository-Funktion ohne `guildId`-Parameter.
- Tabellen: `gilden`, `sitzungen`, `zugriff`, `nachrichten`, `bildvorlagen`,
  `aktionsleisten`, `buttons`, `aktionen`, `klicksperren`, `rueckmeldungen`,
  `willkommen`, `rollen_nachrichten`, `rollenregeln`, `versandvorgaenge`,
  `versandziele`, `protokoll`.
- Fremdschlüssel sind aktiv (`PRAGMA foreign_keys = ON`), WAL-Modus aktiv.
- Ein Test weist nach, dass eine Abfrage mit fremder `guild_id` leer zurückkommt.

### 11.3 `auth`

- Anmeldung ausschliesslich über Discord-OAuth2. Kein Passwort, keine Registrierung.
- Der Rückweg prüft den `state`-Parameter; ein fehlender oder falscher `state`
  führt zu einer Fehlerseite, nicht zu einer Anmeldung.
- Die Sitzung liegt in der Tabelle `sitzungen`; ein Neustart meldet niemanden ab.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` genau dann, wenn `PANEL_URL`
  `https://` ist. Sitzungs-ID wird bei der Anmeldung neu vergeben.
- Vier Zugriffsstufen: `OWNER`, `MODERATOR`, `BETRACHTER`, `KEIN_ZUGRIFF`.
  - `OWNER`: alles, zusätzlich Zugriffsverwaltung und Server hinzufügen.
  - `MODERATOR`: alle Panel-Funktionen inkl. Rollenregeln, Aktionsleisten mit
    Rollen- und Kick-Aktionen, Versand, Bildvorlagen. Keine Zugriffsverwaltung.
  - `BETRACHTER`: nur lesen (Übersicht, Protokoll, Rückmeldungen). Standardmässig
    niemandem zugewiesen.
  - `KEIN_ZUGRIFF`: Vorgabe für alle. Sieht nur eine Abweisungsseite.
- `OWNER` hängt an `OWNER_DISCORD_ID` aus der `.env`, nicht an einer Rolle —
  Selbstaussperrung ist unmöglich.
- Die übrigen Stufen werden Discord-Rollen zugeordnet und bei **jeder Anfrage**
  aus dem Guild-Cache neu bestimmt. Verlorene Rolle wirkt sofort, ohne Abmeldung.
- Jede Route ist explizit einer Mindeststufe zugeordnet; Routen ohne Zuordnung
  sind standardmässig gesperrt. Ein Test führt die Routenliste gegen die
  Rechtematrix und schlägt fehl, sobald eine neue Route ohne Stufe existiert.
- CSRF: Token je Sitzung, in jedem schreibenden Formular, Prüfung per
  zeitkonstantem Vergleich. Fehlend oder falsch ⇒ 403 ohne Nebenwirkung.

### 11.4 `discord`

- Bot verbindet sich mit den Intents `Guilds`, `GuildMembers`, `GuildMessages`
  (letzteres nur, soweit nötig) und behandelt Verbindungsabbrüche mit Wiederaufbau.
- Guild-Cache stellt bereit: Kanäle mit Kategorie, Typ und Schreibrecht des Bots;
  Rollen mit Position, Verwaltet-Kennzeichen und Vergleich zur Bot-Rolle;
  Mitglieder für Suche und Rollenauflösung.
- Interaktions-Router verteilt dreispurig: `buttons/`, `modals/`, `befehle/`.
  `befehle/` ist leer, die Registrierungslogik existiert und meldet vorhandene
  Befehle beim Start an — heute also null.
- Rechte-Vorprüfung: Vor jeder Aktion, die Rechte braucht (kicken, Rolle geben),
  prüft der Bot seine eigene Berechtigung und die Rollenhierarchie und meldet
  im Panel vorab, wenn etwas fehlt.
- Fehlerübersetzung: Discord-Fehlercodes werden auf deutsche Klartexte abgebildet,
  mindestens 50007 (keine DMs von Servermitgliedern), 50013 (fehlende Rechte),
  50001 (kein Zugriff), 10003/10011/10013 (Kanal/Rolle/Nutzer unbekannt),
  40003 (zu viele Anfragen).
- Bot-Status (verbunden / nicht verbunden mit Grund) ist für die Kopfzeile abrufbar.

### 11.5 `ui`

- Layout: Seitenleiste links mit den neun Seiten, Kopfzeile mit Bot-Status,
  Abmelden-Knopf unten in der Leiste (am Telefon oben).
- Seitensuche: Taste `/` oder Knopf oben links; Tippen filtert, Pfeiltasten wählen,
  Enter springt. Ohne JavaScript ist es ein normales Suchformular.
- Telefon-Layout unter 900 px Fensterbreite (nicht Gerätekennung): Navigation wird
  waagerecht scrollende Reihe, eine Spalte, Bedienelemente mindestens 44 px.
- Ohne JavaScript nutzbar: Ziel-Reiter, Filter und Rollen-Pillen sind echte
  Verweise beziehungsweise echte `input`-Elemente. Ein Test ruft die Seiten ohne
  JavaScript ab und prüft, dass Filter und Reiter als Links vorhanden sind.
- Barrierefreiheit: Sprunglink zum Inhalt, sichtbarer Fokusring, beschriftete
  Felder, Zustände über `aria-pressed` und `aria-current`, nicht nur über Farbe.
- Rückfrage vor jedem Löschen; Ladeanzeige beim Absenden, die zugleich doppeltes
  Abschicken verhindert.
- `prefers-reduced-motion` schaltet Übergänge ab.
- Helles und dunkles Farbschema, beide vollständig definiert.

### 11.6 `nachricht`

- Seite `/nachricht` mit zwei Zielen — Direktnachricht und Kanal — als echte
  Verweise; der Wechsel behält den getippten Text.
- Empfängersuche über Mitglieder und Rollen *(braucht Bot)*; eine gewählte Rolle
  wird zu ihren Mitgliedern als Einzelempfänger aufgelöst.
- Gewählte Empfänger als Chips im Feld, vollständig mit Tastatur bedienbar:
  Pfeile wählen, Enter übernimmt, Rücktaste entfernt den letzten.
- Sichtbar: Anzahl gewählter Empfänger, Höchstzahl aus `DM_MAX_RECIPIENTS`,
  Pause aus `DM_DELAY_MS`.
- Kanalauswahl im Discord-Layout *(braucht Bot)*: nach Kategorien gruppiert, mit
  Suche, mit Symbolen für Text-, Ankündigungs- und Thread-Kanäle. Kanäle ohne
  Schreibrecht sind gesperrt und nennen den Grund.
- Text bis 2000 Zeichen mit Zähler in der Schrittmarke.
- Platzhalter-Knopfreihe setzt `{user}`, `{tag}`, `{guild}`, `{role}`, `{count}`
  an die Position der Schreibmarke.
- Embed-Karte anhängbar; Editor klappt darunter auf. Zeichenzähler rechnet Titel,
  Beschreibung, alle Feldnamen und -werte, Fusszeile und Autor gegen das
  gemeinsame Limit von 6000 und meldet die Überschreitung **vor** dem Senden.
- Bildvorlage anhängbar; Aktionsleiste anhängbar.
- Live-Vorschau zeigt Text, Embed, Bildplatzhalter und Buttons zusammen in
  Discord-Optik, umschaltbar zwischen „Mit Beispieldaten" und „Rohtext".
- Entwurf laden: Schublade von rechts mit allen gespeicherten Nachrichten samt
  Auszug; Escape schliesst sie.
- Speichern ohne Senden über Namensfeld; beim Senden wird mitgespeichert, sofern
  ein Name eingetragen ist.
- `/dm` und `/kanaele` leiten dauerhaft (301) auf `/nachricht` um.

### 11.7 `versand`

- Massenversand läuft im Hintergrund; die Seite zeigt laufend Fortschritt und
  wer nicht erreicht wurde *(braucht Bot)*.
- Zwischen zwei Direktnachrichten liegt `DM_DELAY_MS`; mehr als
  `DM_MAX_RECIPIENTS` Empfänger werden abgelehnt, nicht abgeschnitten.
- Jeder Einzelversand wird mit Ergebnis in `versandziele` festgehalten;
  Fehlschläge tragen den übersetzten Klartext, nicht den Zahlencode.
- Ein Versand ohne Bestätigung ist nicht auslösbar.
- Ratenbegrenzung: höchstens 10 Versandvorgänge je Minute.
- Ein Neustart mitten im Versand markiert den Vorgang als abgebrochen und zeigt,
  wie weit er gekommen war.

### 11.8 `bilder`

- Seite `/vorlagen`: ein Bild je Person, Profilbild und Name werden beim Senden
  eingesetzt.
- Format: breit, quadratisch, Banner oder eigene Grösse; Seitenverhältnis wird
  mitgerechnet.
- Hintergrund: eigenes Bild (PNG, JPEG, WebP) oder Grundfarbe, dazu Bildanpassung
  und eine Abdunklung für lesbaren hellen Text.
- Profilbild: an/aus, rund, abgerundet oder quadratisch, mit Position, Grösse, Rand.
- Zwei Textzeilen mit Platzhaltern, Schriftgrösse, Farbe, Ausrichtung, maximaler
  Breite und Schatten. Zu langer Text wird automatisch verkleinert, bis er passt.
- Vorschau wird **vom Server** mit demselben Renderer erzeugt, der später die
  echten Nachrichten baut.
- Profilbild und Texte lassen sich in der Vorschau an ihre Stelle ziehen; ohne
  JavaScript bleiben die Zahlenfelder als Eingabeweg bestehen.
- Vorschau mit echten Mitgliedern statt Beispieldaten *(braucht Bot)*.
- Uploads: nur Bilder, `UPLOAD_MAX_BYTES` und `UPLOAD_MAX_EDGE` werden erzwungen,
  der Dateiname wird vom Server vergeben, das Zielverzeichnis ist nicht verlassbar.
  Die Prüfung erfolgt am Inhalt, nicht an der Endung.
- Ratenbegrenzung: 60 Vorschau-Anfragen je Minute.

### 11.9 `ablage`

- Seite `/nachrichten` listet gespeicherte Nachrichten samt Ziel.
- Filter „Alle / Direktnachricht / Kanal" mit Zahl; der Filter steht in der
  Adresse und übersteht ein Neuladen.
- Öffnen lädt Text, Embed, Bildvorlage, Buttons und das gemerkte Ziel gemeinsam
  in den Editor.
- Kopie anlegen, löschen (mit Rückfrage), umbenennen, Art ändern, Notiz — die
  letzten drei eingeklappt in der Karte.
- Warnung, wenn das Ziel weg ist: gelöschter Kanal oder ausgetretene Empfänger
  werden benannt, nicht stillschweigend übergangen.

### 11.10 `automatik`

**Willkommensnachricht** (`/willkommen`)
- Geht bei jedem Serverbeitritt automatisch als Direktnachricht raus.
- Derselbe Baukasten wie beim Senden, mit Vorschau daneben.
- Aktiv-Schalter: ausgeschaltet bleibt alles gespeichert, geht aber nicht raus.
- Test-DM an das eigene Konto *(braucht Bot)*, samt erzeugtem Bild mit eigenem
  Profilbild und Namen.
- Aktiv ohne Text, Embed und Bild wird abgelehnt.

**Rollen-Nachrichten** (`/rollen-nachrichten`)
- Genau eine Direktnachricht je Rolle; Rollenauswahl als Pillen, ein Punkt zeigt,
  wo schon etwas hinterlegt ist *(braucht Bot)*.
- Löst aus, sobald jemand die Rolle erhält.
- „Jetzt an alle" schickt an alle Mitglieder der Rolle, mit Rückfrage und
  Fortschrittsanzeige *(braucht Bot)*.
- Aktiv-Schalter je Nachricht.

**Rollenregeln** (`/rollenregeln`)
- Wer eine Rolle erhält, verliert automatisch die gewählten anderen.
- Auslöser und Entzug als Pillen, technisch echte Radio- und Kontrollkästchen.
- Gesperrte Rollen nennen den Grund kurz an der Pille und ausführlich im Tooltip:
  steht über der Bot-Rolle, wird von einer Integration verwaltet, ist der Auslöser
  selbst.
- Daneben steht die Regel im Klartext: „Wer ‚Verifiziert' erhält, verliert ‚Neu'."
- Bestehende Regeln sind bearbeitbar, mit Notiz und Aktiv-Schalter.
- Der Bot prüft beim Anwenden erneut — eine Rolle kann inzwischen verschoben
  worden sein.

### 11.11 `aktionen`

- Seite `/aktionsleisten`: Buttons unter einer Nachricht, die beim Klick mehrere
  Dinge nacheinander auslösen.
- Button-Gestaltung: Beschriftung, Emoji, eine von vier Discord-Farben; ein
  Farbpunkt in der Liste zeigt die Wirkung.
- Reihenfolge änderbar; die Oberfläche macht sichtbar, dass Discord fünf Buttons
  je Reihe zeigt und ab dem sechsten eine zweite beginnt.
- Aktionsarten:
  1. DM an den Klickenden, mit eigenem Text, Embed, Bildvorlage und optional
     einer weiteren Aktionsleiste darunter.
  2. DM an eine feste Person oder an eine beim Klick gewählte Person, wahlweise
     auf eine Rolle eingegrenzt. Zusätzliche Platzhalter trennen Klickenden und
     Empfänger.
  3. Rolle geben, entfernen oder umschalten (Umschalten ergibt Selbstbedienungs-Rollen).
  4. Rückmeldung erfragen: Discords Eingabefenster mit bis zu fünf Feldern; die
     Antworten stehen den folgenden Aktionen desselben Buttons als `{feedback}`
     zur Verfügung.
  5. Klickenden kicken, mit Rückfrage und optional einer Rolle als Ausweg; das
     Panel warnt vorab, wenn dem Bot das Recht fehlt.
- Wer klicken darf: je Button auf Rollen eingrenzbar; nichts gewählt heisst alle.
- „Nur einmal je Mitglied" mit Zähler und einem Knopf, der die Sperre löst.
- Bestätigungstext sieht nur der Klickende (ephemer).
- Vorschau wie in Discord, mit Warnung bei Buttons ohne Aktion.
- Eine Kette bricht bei einem Fehler ab, protokolliert den Grund und meldet dem
  Klickenden verständlich, was nicht ging.

### 11.12 `verlauf`

**Übersicht** (`/`)
- Vier Fragen in dieser Reihenfolge: Ging etwas schief? Steht etwas quer? Laufen
  die Automatiken? Was war zuletzt?
- Vier Kennzahlen mit Deutungszeile: zugestellt und fehlgeschlagen in 24 Stunden,
  gespeicherte Nachrichten, aktive Rollenregeln.
- „Braucht Aufmerksamkeit": fehlgeschlagene Versände der letzten 24 Stunden,
  abgeschaltete Regeln, ausgeschaltete Willkommensnachricht, unbenutzte
  Bildvorlagen — jeweils mit Weg dorthin.
- Automatiken mit Zustand; fünf jüngste Vorgänge mit Uhrzeit und Ergebnis;
  Bot-Status in der Kopfzeile mit Hinweis, was zu prüfen ist.

**Rückmeldungen** (`/rueckmeldungen`)
- Antworten aus den Eingabefenstern, gespeichert **mit Namen**. Die Oberfläche
  sagt das ausdrücklich — Discords Eingabefenster kann keine Anonymität zusichern.
- Filter je Button, auch für gelöschte Buttons; CSV-Export; Einzellöschung mit Rückfrage.

**Protokoll** (`/protokoll`)
- Fünf Filter mit Zahl: Alle, Nachrichten, Rollen, Anmeldungen, Fehler.
- Volltextsuche nach Person, Kanal oder Vorgang; der Suchbegriff steht in der Adresse.
- Nach Tagen gruppiert: Heute, Gestern, dann das Datum.
- Grund im Klartext statt Fehlernummer. 50 Einträge je Seite.

### 11.13 `sicherheit` (querschnittlich)

- CSRF-Token in jedem schreibenden Formular.
- Ratenbegrenzung: 300 Anfragen / 15 min allgemein, 20 Anmeldeversuche / 15 min,
  10 Versandvorgänge / min, 60 Vorschau-Anfragen / min.
- Content-Security-Policy vollständig ausgeschrieben, ohne Inline-Code,
  `frame-ancestors 'none'`. Dazu `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options` und bei HTTPS `Strict-Transport-Security`.
- Sitzung in der Datenbank; hinter HTTPS `Secure`-Cookie, was `TRUST_PROXY=1`
  voraussetzt — sonst benannter Startabbruch.
- Uploads geprüft: Typ am Inhalt, Grösse, Kantenlänge, serververgebener Dateiname,
  kein Ausbruch aus dem Upload-Verzeichnis.
- Serverseitige Prüfung aller IDs: Eine manipulierte Kanal- oder Rollen-ID führt
  nicht dazu, dass der Bot irgendwohin schreibt oder etwas vergibt.
- Keine Geheimnisse in Logs, Protokoll oder Fehlerseiten.

---

## 12. Erfolgskriterien

Prüfbar, in dieser Reihenfolge:

1. `npm ci --omit=dev && npm run setup` auf einer frischen Oracle-ARM64-VM führt
   ohne weitere Installation zu einem laufenden Panel. Keine System-Bibliothek,
   kein Docker, keine Datenbank-Software.
2. `npm test` ist grün, Abdeckung ≥ 80 % für `src/`, 100 % für `src/auth/rechte.mjs`
   und `src/aktionen/kette.mjs`. `npm run lint` meldet nichts.
3. Anmeldung über Discord funktioniert über `http://<IP>:3000`; ein Wechsel auf
   `https://<domain>` erfordert nur eine Änderung in der `.env`.
4. Ein Konto ohne zugewiesene Stufe sieht ausschliesslich die Abweisungsseite —
   auf jeder Route, auch bei direkt eingetippter Adresse.
5. Alle neun Seiten sind ohne JavaScript bedienbar: Filter, Ziel-Reiter und
   Rollen-Pillen funktionieren, Formulare senden ab.
6. Ein Serverbeitritt löst die aktive Willkommensnachricht als DM aus, inklusive
   gerendertem Bild mit Profilbild und Name der beitretenden Person.
7. Ein Button mit der Kette „Rückmeldung erfragen → Rolle umschalten → DM an den
   Klickenden" führt alle drei Schritte aus, `{feedback}` steht in der DM, und die
   Antwort erscheint unter `/rueckmeldungen`.
8. Jede der beschriebenen Aktionen erscheint im Protokoll mit Zeit, Person und
   Ergebnis; Fehlschläge im Klartext.
9. Der Sicherheitsdurchgang (Schritt 5) findet keine offene Feststellung der
   Kategorien: fehlende Rechteprüfung, fehlender CSRF-Schutz, Pfad-Ausbruch beim
   Upload, Geheimnis im Log, ungeprüfte Discord-ID.

---

## 13. Offene Fragen

Keine blockierenden. Zwei Punkte, die ich beim Bauen entscheide und dir beim
jeweiligen Arbeitsschritt zeige, statt jetzt zu raten:

1. **Wie die Vorschau ohne JavaScript aussieht.** Mit JavaScript aktualisiert sie
   sich beim Tippen. Ohne JavaScript schlage ich einen „Vorschau aktualisieren"-Knopf
   vor, der die Seite neu lädt — kein zweiter Codepfad, nur ein zusätzlicher Absender.
2. **Genaue Aufteilung der Protokoll-Vorgangsarten** auf die fünf Filter. Die
   Zuordnung entsteht mit den Modulen; sie ist Daten, keine Verzweigung im Code.

---

## 14. Nicht in dieser Ausbaustufe

**Später vorgesehen, Architektur bleibt offen:** Discord-Slash-Befehle
(Verteiler und Registrierung sind gebaut, `befehle/` ist leer), Moderation
(Bans, Warns, Timeouts, Automod — Protokoll-Vorgangsarten sind Daten, das
Rechtesystem ist gestuft, die Bot-Einladung wird bei Bedarf neu erzeugt).

**Nicht vorgesehen:** Ticket-System, Leveling, Musik, Server-Umschalter in der
Oberfläche (Datenmodell kann mehrere Server), andere Sprachen als Deutsch,
Docker- oder Cloud-Deployment, Wiederaufnahme eines Massenversands nach Neustart.
