# Arbeitsschritte: Discord-Panel 2.0

59 Schritte, 10 Phasen. Plan und Begründungen: `tasks/plan.md`.
Grundlage: `docs/SPEC.md`.

**Für jeden Schritt gilt:** Test zuerst (rot), dann Code (grün), dann Commit.
`npm test` und `npm run lint` müssen grün sein, bevor ein Schritt abgehakt wird.

---

## Phase 0 — Gerüst

- [x] **1 · Projektgerüst und Werkzeugkette** — M · hängt ab von: —
  - **Abnahme:** `package.json` mit `"type": "module"`, Node-Anforderung `>=22.13`,
    den fünf Laufzeit-Abhängigkeiten und den Skripten aus der Spec.
    ESLint-Konfiguration. `npm start` startet einen Express-Server, der auf `/`
    „Panel läuft" ausgibt.
  - **Abnahme:** Verzeichnisgerüst aus Spec Abschnitt 6 angelegt, `speicher/`
    und `.env` in `.gitignore`.
  - **Prüfen:** `npm test` läuft (ein Rauchtest, grün). `npm run lint` meldet nichts.
    `npm start` antwortet auf `http://localhost:3000/`.
  - **Dateien:** `package.json`, `eslint.config.mjs`, `src/web/server.mjs`,
    `src/start.mjs`, `tests/einheit/rauch.test.mjs`

- [x] **2 · Konfiguration und Startprüfung** — S · hängt ab von: 1
  - **Abnahme:** `.env` wird über `--env-file` gelesen; fehlende Pflichtvariable
    bricht den Start mit benannter Meldung ab (welche Variable, wo sie herkommt).
  - **Abnahme:** `PANEL_URL` mit `https://` ohne `TRUST_PROXY=1` bricht ab.
    Node-Version unter 22.13 bricht ab. Vorgabewerte greifen
    (`DM_MAX_RECIPIENTS=100`, `DM_DELAY_MS=1200`, `PORT=3000`,
    `UPLOAD_MAX_BYTES=5242880`, `UPLOAD_MAX_EDGE=4096`).
  - **Prüfen:** Tests für jeden Abbruchgrund einzeln, jeweils mit der erwarteten Meldung.
  - **Dateien:** `src/kern/konfig.mjs`, `.env.example`, `tests/einheit/konfig.test.mjs`

- [x] **3 · Logger mit Geheimnis-Maskierung** — S · hängt ab von: 2
  - **Abnahme:** Strukturierte Ausgabe nach stdout mit Zeitstempel, Stufe, Bereich.
  - **Abnahme:** Token, Client-Secret und Sitzungsschlüssel werden maskiert —
    auch wenn sie in einem verschachtelten Objekt oder in einer Fehlermeldung stecken.
  - **Prüfen:** Test schreibt ein Objekt mit echtem Token-Format und weist nach,
    dass die Ausgabe es nicht enthält.
  - **Dateien:** `src/kern/logger.mjs`, `tests/einheit/logger.test.mjs`

### Kontrollpunkt 0
- [x] `npm test`, `npm run lint`, `npm start` — alle drei grün.

---

## Phase 1 — Datenbank und Anmeldung

- [x] **4 · Migrations-Runner** — S · hängt ab von: 2
  - **Abnahme:** Nummerierte Migrationen aus `src/daten/migrationen/` laufen der
    Reihe nach, jede genau einmal, festgehalten in `schema_version`.
    `PRAGMA foreign_keys = ON` und WAL-Modus aktiv.
  - **Abnahme:** Zweiter Lauf ist folgenlos. Eine fehlgeschlagene Migration bricht
    ab, ohne die Versionsnummer zu erhöhen.
  - **Prüfen:** Test mit temporärer Datei; zweimal laufen lassen, Schema vergleichen.
  - **Dateien:** `src/daten/db.mjs`, `src/daten/migrieren.mjs`, `tests/einheit/migrieren.test.mjs`

- [x] **5 · Schema 001 und Repository-Grundlage** — M · hängt ab von: 4
  - **Abnahme:** Tabellen `gilden`, `sitzungen`, `zugriff`, `protokoll` angelegt,
    jede fachliche Tabelle mit `guild_id`.
  - **Abnahme:** Repository-Grundlage erzwingt `guildId` als ersten Parameter;
    eine Abfrage mit fremder `guild_id` liefert leer.
  - **Prüfen:** Test legt zwei Gilden an, schreibt in eine, liest mit der anderen
    und erwartet ein leeres Ergebnis.
  - **Dateien:** `src/daten/migrationen/001-grundlage.sql`, `src/daten/repository.mjs`,
    `src/daten/gilden.mjs`, `tests/einheit/repository.test.mjs`

- [x] **6 · Sitzungen in der Datenbank** — S · hängt ab von: 5
  - **Abnahme:** Sitzung anlegen, lesen, verlängern, ablaufen lassen, löschen.
    Sitzungs-ID kryptografisch zufällig, Cookie `HttpOnly`, `SameSite=Lax`,
    `Secure` genau dann, wenn `PANEL_URL` `https://` ist.
  - **Abnahme:** Abgelaufene Sitzungen werden beim Lesen verworfen und aufgeräumt.
  - **Prüfen:** Tests für Ablauf, für Secure-Schaltung bei beiden `PANEL_URL`-Formen.
  - **Dateien:** `src/auth/sitzung.mjs`, `tests/einheit/sitzung.test.mjs`

- [x] **7 · Anmeldung über Discord** — M · hängt ab von: 6
  - **Abnahme:** `/login` leitet zu Discord mit zufälligem `state`; `/auth/callback`
    prüft `state` und tauscht den Code gegen ein Token. Falscher oder fehlender
    `state` führt zur Fehlerseite, nicht zur Anmeldung.
  - **Abnahme:** Bei erfolgreicher Anmeldung wird die Sitzungs-ID neu vergeben
    (kein Session-Fixation). `/logout` löscht die Sitzung serverseitig.
  - **Prüfen:** Integrationstest gegen einen lokalen Discord-Ersatz; Fälle:
    gültig, falscher state, fehlender state, abgelehnter Code.
  - **Dateien:** `src/auth/oauth.mjs`, `src/web/seiten/anmeldung.mjs`,
    `tests/integration/anmeldung.test.mjs`

- [x] **8 · Zugriffsstufen und Rechtematrix** — M · hängt ab von: 7 · **100 % Abdeckung**
  - **Abnahme:** Vier Stufen `OWNER`, `MODERATOR`, `BETRACHTER`, `KEIN_ZUGRIFF`.
    `OWNER` aus `OWNER_DISCORD_ID`, übrige aus Discord-Rollen, bei jeder Anfrage
    neu bestimmt. Vorgabe ist `KEIN_ZUGRIFF`.
  - **Abnahme:** `verlangt(stufe)`-Middleware; Routen ohne zugeordnete Stufe sind gesperrt.
  - **Abnahme:** Ein Test führt die registrierte Routenliste gegen die Rechtematrix
    und schlägt fehl, sobald eine Route ohne Stufe existiert.
  - **Prüfen:** Matrixtest über alle vier Stufen × alle Routen. Abdeckung
    `src/auth/rechte.mjs` = 100 %.
  - **Dateien:** `src/auth/rechte.mjs`, `src/web/mw/verlangt.mjs`,
    `tests/einheit/rechte.test.mjs`, `tests/integration/routenabdeckung.test.mjs`

- [x] **9 · CSRF-Schutz** — S · hängt ab von: 8
  - **Abnahme:** Token je Sitzung, in jedem schreibenden Formular, zeitkonstant
    verglichen. Fehlend oder falsch ⇒ 403 ohne Nebenwirkung.
  - **Prüfen:** Integrationstest: POST ohne Token, mit fremdem Token, mit gültigem
    Token — und Nachweis, dass in den ersten beiden Fällen nichts geschrieben wurde.
  - **Dateien:** `src/auth/csrf.mjs`, `tests/integration/csrf.test.mjs`

- [x] **10 · Sicherheits-Header und Ratenbegrenzung** — S · hängt ab von: 9
  - **Abnahme:** CSP vollständig ausgeschrieben, ohne `unsafe-inline`, mit
    `frame-ancestors 'none'`; dazu `X-Content-Type-Options`, `Referrer-Policy`,
    `X-Frame-Options`, bei HTTPS `Strict-Transport-Security`.
  - **Abnahme:** Grenzen: 300 Anfragen / 15 min allgemein, 20 Anmeldeversuche / 15 min.
    (Versand und Vorschau folgen in Schritt 27 und 31.)
  - **Prüfen:** Test liest die Header; Test überschreitet die Anmeldegrenze und
    erwartet 429.
  - **Dateien:** `src/web/mw/sicherheit.mjs`, `tests/integration/sicherheit.test.mjs`

### Kontrollpunkt A — Anmeldung
- [x] Anmeldung über Discord funktioniert Ende zu Ende.
- [x] Ein Konto ohne Stufe sieht auf jeder Route nur die Abweisungsseite.
- [x] Header und Ratenbegrenzung greifen. Tests grün, Linting sauber.
- [ ] **Dir zeigen:** Anmeldeablauf und die Rechtematrix.

---

## Phase 2 — Bot, Guild-Cache, Grundoberfläche

- [x] **11 · Bot-Verbindung und Testdoppel** — M · hängt ab von: 3
  - **Abnahme:** discord.js verbindet mit den nötigen Intents, behandelt
    Verbindungsabbruch mit Wiederaufbau, meldet Status (verbunden / nicht
    verbunden mit Grund).
  - **Abnahme:** Ein Testdoppel mit derselben Schnittstelle liegt in
    `tests/hilfen/` und bildet einen erfundenen Server mit Kanälen, Rollen und
    Mitgliedern ab.
  - **Prüfen:** Tests laufen ausschliesslich gegen das Doppel.
  - **Dateien:** `src/discord/bot.mjs`, `src/discord/status.mjs`,
    `tests/hilfen/discord-doppel.mjs`, `tests/einheit/bot.test.mjs`

- [x] **12 · Guild-Cache und Rechte-Vorprüfung** — M · hängt ab von: 11
  - **Abnahme:** Kanäle mit Kategorie, Typ und Schreibrecht des Bots; Rollen mit
    Position, Verwaltet-Kennzeichen und Vergleich zur höchsten Bot-Rolle;
    Mitglieder für Suche und Rollenauflösung.
  - **Abnahme:** `darfBot(aktion, ziel)` beantwortet vorab, ob Kicken oder
    Rollenvergabe möglich ist, und nennt sonst den Grund.
  - **Prüfen:** Tests für: Rolle über der Bot-Rolle, von Integration verwaltete
    Rolle, Kanal ohne Schreibrecht.
  - **Dateien:** `src/discord/gilde.mjs`, `src/discord/rechte.mjs`,
    `tests/einheit/gilde.test.mjs`

- [x] **13 · Discord-Fehler in Klartext** — S · hängt ab von: 11
  - **Abnahme:** Abbildung für mindestens 50007, 50013, 50001, 10003, 10011,
    10013, 40003 auf deutsche Sätze. Unbekannter Code ergibt einen verständlichen
    Fallback statt einer nackten Zahl.
  - **Prüfen:** Test je Code; Test für unbekannten Code.
  - **Dateien:** `src/discord/fehler.mjs`, `tests/einheit/fehler.test.mjs`

- [x] **14 · Interaktions-Router, dreispurig** — M · hängt ab von: 11
  - **Abnahme:** Verteiler für `buttons/`, `modals/`, `befehle/`. Unbekannte
    Interaktion wird protokolliert und beantwortet, statt still zu verfallen.
  - **Abnahme:** `befehle/` ist leer; die Registrierungslogik läuft beim Start
    und meldet die vorhandenen Befehle (heute null) bei Discord an.
  - **Prüfen:** Test schickt je eine Interaktion jeder Spur durch das Doppel;
    Test für leeres `befehle/` (keine Fehlermeldung, keine Registrierung).
  - **Dateien:** `src/discord/interaktion/router.mjs`,
    `src/discord/interaktion/registrieren.mjs`, `tests/einheit/router.test.mjs`

- [x] **15 · HTML-Grundlage und Layout** — M · hängt ab von: 8
  - **Abnahme:** `html`-Tag maskiert jeden eingesetzten Wert automatisch;
    ein bewusst als sicher markierter Wert wird nicht doppelt maskiert.
  - **Abnahme:** Layout mit Seitenleiste (neun Seiten), Kopfzeile mit Bot-Status,
    Abmelden-Knopf, Sprunglink zum Inhalt.
  - **Prüfen:** Test setzt `<script>alert(1)</script>` als Wert ein und weist nach,
    dass es maskiert in der Ausgabe steht.
  - **Dateien:** `src/web/html/html.mjs`, `src/web/html/layout.mjs`,
    `tests/einheit/html.test.mjs`

- [x] **16 · Stylesheet: Farbschemata, Telefon-Layout, Fokus** — M · hängt ab von: 15
  - **Abnahme:** Helles und dunkles Schema vollständig definiert; Telefon-Layout
    unter 900 px Fensterbreite mit waagerecht scrollender Navigation und 44-px-Bedienelementen.
  - **Abnahme:** Sichtbarer Fokusring; `prefers-reduced-motion` schaltet Übergänge ab.
    Keine Inline-Styles — die Datei wird mit Hash im Namen ausgeliefert.
  - **Prüfen:** Test prüft, dass die ausgelieferte Seite kein `style="` enthält
    und die CSP-Kopfzeile zum Stylesheet-Pfad passt.
  - **Dateien:** `src/web/oeffentlich/panel.css`, `src/web/html/layout.mjs`,
    `tests/integration/kein-inline.test.mjs`

- [x] **17 · Seitensuche** — S · hängt ab von: 16
  - **Abnahme:** Taste `/` und Knopf oben links öffnen die Suche; Tippen filtert,
    Pfeile wählen, Enter springt.
  - **Abnahme:** Ohne JavaScript ist es ein normales Suchformular, das zur
    Trefferseite führt.
  - **Prüfen:** Integrationstest ruft die Suche ohne JavaScript auf und folgt dem Treffer.
  - **Dateien:** `src/web/seiten/suche.mjs`, `src/web/oeffentlich/suche.js`,
    `tests/integration/suche.test.mjs`

- [x] **18 · Protokoll schreiben und lesen** — S · hängt ab von: 5
  - **Abnahme:** `protokoll.schreibe(art, nutzer, daten)` legt einen Eintrag mit
    Zeit, Person, Vorgangsart und Ergebnis an. Vorgangsarten sind Daten, keine
    fest verdrahteten Fälle.
  - **Abnahme:** Lesefunktionen mit Filter, Volltextsuche und Seitenweise (50).
    Keine Geheimnisse im Eintrag.
  - **Prüfen:** Test schreibt Einträge und prüft Filter, Suche, Seitengrenzen.
  - **Dateien:** `src/protokoll/protokoll.mjs`, `tests/einheit/protokoll.test.mjs`

### Kontrollpunkt B — Bot und Oberfläche
- [x] Bot-Status steht in der Kopfzeile. Layout in beiden Farbschemata, am Telefon brauchbar.
- [x] Interaktions-Router nimmt alle drei Spuren an, `befehle/` ist leer und stört nicht.
- [ ] **Dir zeigen:** Layout hell/dunkel, Telefonansicht, Bot-Status verbunden und getrennt.

---

## Phase 3 — Nachrichtenbaukasten

- [x] **19 · Platzhalter-Ersetzung** — S · hängt ab von: 12
  - **Abnahme:** `{user}`, `{tag}`, `{guild}`, `{role}`, `{count}` werden ersetzt;
    unbekannte Platzhalter bleiben unverändert stehen statt zu verschwinden.
  - **Abnahme:** Ein Rohtext-Modus liefert den Text ohne Ersetzung zurück.
  - **Prüfen:** Tests je Platzhalter, für unbekannte, für doppelte geschweifte Klammern.
  - **Dateien:** `src/nachricht/platzhalter.mjs`, `tests/einheit/platzhalter.test.mjs`

- [ ] **20 · Nachrichtenmodell, Validierung, Zeichenzähler** — M · hängt ab von: 19
  - **Abnahme:** Modell aus Text, Embed, Bildvorlage, Aktionsleiste, Ziel.
    Text bis 2000 Zeichen.
  - **Abnahme:** Embed-Zähler summiert Titel, Beschreibung, alle Feldnamen und
    -werte, Fusszeile und Autor gegen 6000 — genau wie Discord rechnet.
  - **Abnahme:** Eine leere Nachricht (kein Text, kein Embed, kein Bild) ist ungültig.
  - **Prüfen:** Tests für 2000/2001 Zeichen, für 6000/6001 Embed-Zeichen, für leer.
  - **Dateien:** `src/nachricht/modell.mjs`, `src/nachricht/pruefen.mjs`,
    `tests/einheit/nachricht.test.mjs`

- [x] **21 · Seite /nachricht ohne JavaScript** — M · hängt ab von: 20, 16
  - **Abnahme:** Ziel-Reiter Direktnachricht/Kanal als echte Verweise; der Wechsel
    behält den getippten Text. Textfeld mit Zähler in der Schrittmarke.
  - **Abnahme:** Platzhalter-Knopfreihe unter dem Feld; ohne JavaScript hängt sie
    den Platzhalter ans Textende statt an die Schreibmarke.
  - **Abnahme:** `/dm` und `/kanaele` leiten mit 301 auf `/nachricht` um.
  - **Prüfen:** Integrationstest ohne JavaScript: Reiter wechseln, Text bleibt,
    Weiterleitungen greifen.
  - **Dateien:** `src/web/seiten/nachricht.mjs`, `src/web/html/bausteine.mjs`,
    `tests/integration/nachricht.test.mjs`

- [x] **22 · Embed-Editor** — M · hängt ab von: 21
  - **Abnahme:** Ein Knopf schaltet die Embed-Karte ein, der Editor klappt darunter
    auf: Titel, Beschreibung, Felder, Fusszeile, Autor, Farbe.
  - **Abnahme:** Der 6000er-Zähler steht sichtbar am Editor und meldet die
    Überschreitung vor dem Absenden.
  - **Prüfen:** Integrationstest legt ein Embed über 6000 Zeichen an und erwartet
    422 mit benannter Fehlermeldung am richtigen Feld.
  - **Dateien:** `src/web/seiten/nachricht.mjs`, `src/web/html/embed.mjs`,
    `tests/integration/embed.test.mjs`

- [x] **23 · Live-Vorschau in Discord-Optik** — M · hängt ab von: 22
  - **Abnahme:** Text, Embed-Karte, Bildplatzhalter und Buttons zusammen, in
    Discords Optik; umschaltbar zwischen „Mit Beispieldaten" und „Rohtext".
  - **Abnahme:** Mit JavaScript aktualisiert sie sich beim Tippen; ohne
    JavaScript gibt es einen Knopf „Vorschau aktualisieren", der die Seite neu lädt.
    **Beide Wege nutzen denselben serverseitigen Erzeuger.**
  - **Prüfen:** Test vergleicht die Vorschau-Ausgabe beider Wege auf Gleichheit.
  - **Dateien:** `src/nachricht/vorschau.mjs`, `src/web/oeffentlich/vorschau.js`,
    `tests/integration/vorschau.test.mjs`

- [x] **24 · Empfängersuche mit Chips** — M · hängt ab von: 21, 12
  - **Abnahme:** Suchfeld über Mitglieder und Rollen; eine gewählte Rolle wird zu
    ihren Mitgliedern als Einzelempfänger aufgelöst.
  - **Abnahme:** Gewählte als Chips im Feld, mit Tastatur bedienbar: Pfeile wählen,
    Enter übernimmt, Rücktaste entfernt den letzten.
  - **Abnahme:** Sichtbar: gewählte Anzahl, `DM_MAX_RECIPIENTS`, `DM_DELAY_MS`.
  - **Prüfen:** Test für Rollenauflösung inklusive Doppelter (jemand in zwei
    gewählten Rollen zählt einmal); Test für Tastaturbedienung ohne JavaScript.
  - **Dateien:** `src/versand/empfaenger.mjs`, `src/web/seiten/nachricht.mjs`,
    `src/web/oeffentlich/chips.js`, `tests/einheit/empfaenger.test.mjs`

- [x] **25 · Kanalauswahl im Discord-Layout** — M · hängt ab von: 21, 12
  - **Abnahme:** Nach Kategorien gruppiert, mit Suche, mit den Symbolen für Text-,
    Ankündigungs- und Thread-Kanäle.
  - **Abnahme:** Kanäle ohne Schreibrecht des Bots sind gesperrt und nennen den Grund.
  - **Prüfen:** Test mit einem Kanal ohne Schreibrecht: gesperrt dargestellt, und
    ein untergeschobener POST auf diese Kanal-ID wird serverseitig abgelehnt.
  - **Dateien:** `src/web/html/kanalwahl.mjs`, `src/web/seiten/nachricht.mjs`,
    `tests/integration/kanalwahl.test.mjs`

### Kontrollpunkt C — Nachrichtenbaukasten
- [x] Nachricht mit Text, Platzhaltern und Embed schreibbar, Vorschau stimmt.
- [x] Empfänger und Kanäle wählbar, Grenzen sichtbar, gesperrte Kanäle abgelehnt.
- [x] Alles ohne JavaScript bedienbar.
- [ ] **Dir zeigen:** Editor mit Vorschau, mit und ohne JavaScript.

---

## Phase 4 — Versand

- [x] **26 · Empfängerauflösung und Grenzen** — S · hängt ab von: 24
  - **Abnahme:** Mehr als `DM_MAX_RECIPIENTS` Empfänger werden **abgelehnt**, nicht
    abgeschnitten — mit Meldung, wie viele es sind und wie viele erlaubt.
  - **Abnahme:** Ausgetretene Mitglieder und gelöschte Rollen werden erkannt und benannt.
  - **Prüfen:** Tests für Grenze genau erreicht, um eins überschritten, mit
    ausgetretenem Mitglied.
  - **Dateien:** `src/versand/empfaenger.mjs`, `tests/einheit/grenzen.test.mjs`

- [ ] **27 · Versand-Warteschlange mit Fortschritt** — M · hängt ab von: 26, 13
  - **Abnahme:** Läuft im Hintergrund, `DM_DELAY_MS` zwischen zwei DMs, Fortschritt
    und Einzelergebnisse in der Datenbank.
  - **Abnahme:** Fehler 40003 pausiert den Versand statt ihn abzubrechen;
    andere Fehler werden je Empfänger im Klartext festgehalten.
  - **Abnahme:** Ein Neustart markiert einen laufenden Vorgang als abgebrochen,
    mit Angabe, wie weit er kam.
  - **Abnahme:** Höchstens 10 Versandvorgänge je Minute.
  - **Prüfen:** Tests gegen das Doppel: Erfolg, einzelner Fehlschlag, 40003-Pause,
    Abbruch beim Start.
  - **Dateien:** `src/versand/warteschlange.mjs`, `src/daten/versand.mjs`,
    `tests/einheit/warteschlange.test.mjs`

- [x] **28 · Versandseite mit Bestätigung und Fortschritt** — M · hängt ab von: 27
  - **Abnahme:** Kein Versand ohne Rückfrage. Danach Fortschrittsanzeige mit
    „x von y", Liste der Nichterreichten mit Grund im Klartext.
  - **Abnahme:** Ohne JavaScript zeigt ein Neuladen den aktuellen Stand.
  - **Prüfen:** Integrationstest: POST ohne Bestätigung wird abgelehnt; mit
    Bestätigung erscheint der Vorgang und der Fortschritt ist abrufbar.
  - **Dateien:** `src/web/seiten/versand.mjs`, `src/web/oeffentlich/fortschritt.js`,
    `tests/integration/versand.test.mjs`

### Kontrollpunkt D — Versand
- [x] Erste echte Direktnachricht wird verschickt (gegen den Prüfstand; auf deinem Server, sobald der Bot verbunden ist).
- [x] Fortschritt sichtbar, Fehlschläge im Klartext, Grenzen greifen.
- [ ] **Dir zeigen:** Ein Versand an zwei Empfänger, davon einer mit gesperrten DMs.

---

## Phase 5 — Bildvorlagen

- [x] **29 · Renderer** — M · hängt ab von: 3
  - **Abnahme:** `@napi-rs/canvas` mit der mitgelieferten Schrift; Formate breit,
    quadratisch, Banner, eigene Grösse mit korrektem Seitenverhältnis.
  - **Abnahme:** Hintergrundbild oder Grundfarbe, Bildanpassung, Abdunklung;
    Profilbild rund/abgerundet/eckig mit Position, Grösse, Rand; zwei Textzeilen
    mit Grösse, Farbe, Ausrichtung, maximaler Breite, Schatten.
  - **Abnahme:** Zu langer Text wird automatisch verkleinert, bis er passt.
  - **Prüfen:** Test rendert gegen feste Erwartungswerte: Bildgrösse, PNG-Format,
    Pixelfarbe an drei definierten Stellen; Test für Auto-Verkleinerung mit einem
    absurd langen Namen.
  - **Dateien:** `src/bilder/renderer.mjs`, `src/bilder/schrift.mjs`,
    `assets/fonts/`, `tests/integration/renderer.test.mjs`

- [x] **30 · Upload-Prüfung** — S · hängt ab von: 29
  - **Abnahme:** Nur PNG, JPEG, WebP — geprüft **am Inhalt**, nicht an der Endung.
    `UPLOAD_MAX_BYTES` und `UPLOAD_MAX_EDGE` werden erzwungen, bevor geschrieben wird.
  - **Abnahme:** Dateiname wird vom Server vergeben; kein Ausbruch aus
    `speicher/uploads/` möglich.
  - **Prüfen:** Tests: umbenannte Textdatei, zu grosse Datei, zu grosse Kantenlänge,
    Dateiname mit `../` und mit Null-Byte.
  - **Dateien:** `src/bilder/upload.mjs`, `tests/integration/upload.test.mjs`

- [x] **31 · Seite /vorlagen mit serverseitiger Vorschau** — M · hängt ab von: 30, 16
  - **Abnahme:** Editor für alle Einstellungen aus Schritt 29; die Vorschau wird
    vom Server mit demselben Renderer erzeugt, der später die echten Bilder baut.
  - **Abnahme:** 60 Vorschau-Anfragen je Minute. Anlegen, bearbeiten, löschen
    (mit Rückfrage).
  - **Prüfen:** Integrationstest ruft die Vorschau ab und prüft `Content-Type`
    und Bildgrösse; Test für die Ratengrenze.
  - **Dateien:** `src/web/seiten/vorlagen.mjs`, `src/daten/bildvorlagen.mjs`,
    `tests/integration/vorlagen.test.mjs`

- [x] **32 · Ziehen in der Vorschau** — S · hängt ab von: 31
  - **Abnahme:** Profilbild und Textzeilen lassen sich in der Vorschau verschieben;
    die Zahlenfelder aktualisieren sich mit.
  - **Abnahme:** Ohne JavaScript bleiben die Zahlenfelder der vollwertige Eingabeweg.
  - **Prüfen:** Integrationstest setzt die Position über die Zahlenfelder und
    prüft das gerenderte Ergebnis.
  - **Dateien:** `src/web/oeffentlich/ziehen.js`, `src/web/seiten/vorlagen.mjs`,
    `tests/integration/position.test.mjs`

- [x] **33 · Vorschau mit echten Mitgliedern** — S · hängt ab von: 31, 12
  - **Abnahme:** Statt Beispieldaten ein tatsächliches Profil aus dem Guild-Cache,
    wählbar über eine Mitgliedersuche.
  - **Prüfen:** Test gegen das Doppel mit einem sehr langen Anzeigenamen.
  - **Dateien:** `src/web/seiten/vorlagen.mjs`, `tests/integration/vorschau-mitglied.test.mjs`

- [x] **34 · Bildvorlage an Nachricht anhängen** — S · hängt ab von: 31, 20
  - **Abnahme:** Eine Nachricht kann eine Bildvorlage tragen; beim Versand wird je
    Empfänger ein eigenes Bild erzeugt und angehängt.
  - **Prüfen:** Test verschickt an zwei Empfänger und weist nach, dass zwei
    unterschiedliche Bilder entstanden sind.
  - **Dateien:** `src/nachricht/modell.mjs`, `src/versand/warteschlange.mjs`,
    `tests/integration/bild-versand.test.mjs`

### Kontrollpunkt E — Bildvorlagen
- [x] Bild mit deinem Profilbild und Namen wird erzeugt und verschickt.
- [x] Uploads sicher, Vorschau stimmt mit dem Ergebnis überein.
- [x] **Dir zeigen:** Eine fertige Bildvorlage, gerendert mit einem echten Profil.

---

## Phase 6 — Gespeicherte Nachrichten

- [x] **35 · Speichern und Liste mit Filter** — M · hängt ab von: 20
  - **Abnahme:** Speichern über das Namensfeld, mit und ohne Senden.
    Liste unter `/nachrichten` mit Auszug und Ziel.
  - **Abnahme:** Filter „Alle / Direktnachricht / Kanal" mit Zahl; der Filter steht
    in der Adresse und übersteht ein Neuladen.
  - **Prüfen:** Integrationstest: speichern, filtern, neu laden, Filter hält.
  - **Dateien:** `src/daten/nachrichten.mjs`, `src/web/seiten/nachrichten.mjs`,
    `tests/integration/ablage.test.mjs`

- [x] **36 · Öffnen, Kopie, Löschen, Umbenennen, Art ändern, Notiz** — M · hängt ab von: 35
  - **Abnahme:** Öffnen lädt Text, Embed, Bildvorlage, Buttons und das gemerkte
    Ziel gemeinsam in den Editor.
  - **Abnahme:** Kopie anlegen; löschen mit Rückfrage; umbenennen, Art ändern und
    Notiz eingeklappt in der Karte.
  - **Prüfen:** Test: Kopie ist unabhängig vom Original; Art-Wechsel behält den Text.
  - **Dateien:** `src/web/seiten/nachrichten.mjs`, `src/daten/nachrichten.mjs`,
    `tests/integration/ablage-aktionen.test.mjs`

- [x] **37 · Warnung, wenn das Ziel weg ist** — S · hängt ab von: 36, 12
  - **Abnahme:** Gelöschter Kanal oder ausgetretene Empfänger werden in der Karte
    benannt, nicht stillschweigend übergangen.
  - **Prüfen:** Test entfernt Kanal und Mitglied aus dem Doppel und erwartet beide
    Warnungen mit Namen.
  - **Dateien:** `src/web/seiten/nachrichten.mjs`, `tests/integration/zielwarnung.test.mjs`

- [x] **38 · Entwurfs-Schublade im Editor** — S · hängt ab von: 36, 21
  - **Abnahme:** Schublade von rechts mit allen gespeicherten Nachrichten samt
    Auszug; Escape schliesst sie.
  - **Abnahme:** Ohne JavaScript ist es eine eigene Seite mit derselben Liste.
  - **Prüfen:** Integrationstest lädt eine gespeicherte Nachricht in den Editor.
  - **Dateien:** `src/web/html/schublade.mjs`, `src/web/oeffentlich/schublade.js`,
    `tests/integration/schublade.test.mjs`

### Kontrollpunkt F — Vorlagenbibliothek
- [x] Nachrichten speichern, wiederfinden, kopieren, wieder senden.
- [x] **Dir zeigen:** Deine ersten drei gespeicherten Nachrichten.

---

## Phase 7 — Automatiken · **Dein Einrichtungstag**

- [x] **39 · Willkommensnachricht: Seite und Schalter** — M · hängt ab von: 34, 23
  - **Abnahme:** `/willkommen` mit demselben Baukasten wie `/nachricht` (Text,
    Platzhalter, Embed, Bildvorlage, Aktionsleiste) und Vorschau daneben.
  - **Abnahme:** Aktiv-Schalter: ausgeschaltet bleibt alles gespeichert, geht aber
    bei einem Beitritt nicht raus.
  - **Abnahme:** Aktiv ohne Text, Embed und Bild wird mit benannter Meldung abgelehnt.
  - **Prüfen:** Tests für alle drei Abnahmepunkte, inklusive der Ablehnung.
  - **Dateien:** `src/web/seiten/willkommen.mjs`, `src/daten/willkommen.mjs`,
    `tests/integration/willkommen.test.mjs`

- [x] **40 · Beitritt löst Willkommensnachricht aus** — S · hängt ab von: 39, 27
  - **Abnahme:** `guildMemberAdd` verschickt die aktive Willkommensnachricht als DM,
    mit erzeugtem Bild und ersetzten Platzhaltern.
  - **Abnahme:** Ist sie inaktiv, passiert nichts — aber das Protokoll hält fest, dass
    ein Beitritt war.
  - **Prüfen:** Test löst das Ereignis am Doppel aus: einmal aktiv, einmal inaktiv.
  - **Dateien:** `src/automatik/willkommen.mjs`, `src/discord/ereignisse.mjs`,
    `tests/einheit/willkommen-ereignis.test.mjs`

- [x] **41 · Test-DM an mich** — S · hängt ab von: 40
  - **Abnahme:** Knopf schickt den gespeicherten Stand an das eigene Konto, samt
    erzeugtem Bild mit eigenem Profilbild und Namen.
  - **Abnahme:** Schlägt der Versand fehl, steht der Grund im Klartext auf der Seite.
  - **Prüfen:** Test gegen das Doppel für Erfolg und für Fehler 50007.
  - **Dateien:** `src/web/seiten/willkommen.mjs`, `tests/integration/test-dm.test.mjs`

- [ ] **42 · Rollen-Nachrichten: Seite und Rollenpillen** — M · hängt ab von: 39
  - **Abnahme:** `/rollen-nachrichten` mit Rollenauswahl als Pillen; ein Punkt zeigt,
    für welche Rolle schon etwas hinterlegt ist. Genau eine Nachricht je Rolle.
  - **Abnahme:** Aktiv-Schalter je Nachricht. Pillen sind echte Formularelemente
    und ohne JavaScript bedienbar.
  - **Prüfen:** Test: zweite Nachricht für dieselbe Rolle ersetzt die erste statt
    eine zweite anzulegen.
  - **Dateien:** `src/web/seiten/rollen-nachrichten.mjs`,
    `src/daten/rollen_nachrichten.mjs`, `tests/integration/rollen-nachrichten.test.mjs`

- [ ] **43 · Rollenerhalt löst aus · „Jetzt an alle"** — M · hängt ab von: 42, 27
  - **Abnahme:** `guildMemberUpdate` erkennt eine hinzugekommene Rolle und
    verschickt die zugehörige aktive Nachricht.
  - **Abnahme:** „Jetzt an alle" schickt an alle Mitglieder der Rolle, mit Rückfrage
    und Fortschrittsanzeige.
  - **Prüfen:** Test: Rolle hinzugefügt löst aus, Rolle entfernt löst nicht aus,
    mehrere Rollen gleichzeitig lösen jede zugehörige Nachricht aus.
  - **Dateien:** `src/automatik/rollen-nachricht.mjs`, `src/discord/ereignisse.mjs`,
    `tests/einheit/rollen-ereignis.test.mjs`

- [ ] **44 · Rollenregeln: Seite** — M · hängt ab von: 12, 16
  - **Abnahme:** `/rollenregeln` mit Auslöser (Radio) und Entzug (Kontrollkästchen)
    als Pillen — technisch echte Formularelemente, damit Tastatur und Screenreader
    ohne Zutun funktionieren.
  - **Abnahme:** Gesperrte Rollen nennen den Grund kurz an der Pille und ausführlich
    im Tooltip: über der Bot-Rolle, von Integration verwaltet, Auslöser selbst.
  - **Abnahme:** Die Regel steht daneben im Klartext: „Wer ‚X' erhält, verliert ‚Y'."
    Bestehende Regeln sind bearbeitbar, mit Notiz und Aktiv-Schalter.
  - **Prüfen:** Test für jeden der drei Sperrgründe; Test, dass ein untergeschobener
    POST mit gesperrter Rollen-ID abgelehnt wird.
  - **Dateien:** `src/web/seiten/rollenregeln.mjs`, `src/daten/rollenregeln.mjs`,
    `tests/integration/rollenregeln.test.mjs`

- [ ] **45 · Rollenregel anwenden mit Laufzeitprüfung** — S · hängt ab von: 44, 43
  - **Abnahme:** Beim Erhalt der Auslöserrolle werden die gewählten anderen entzogen.
  - **Abnahme:** Der Bot prüft beim Anwenden erneut — eine Rolle kann inzwischen
    über die Bot-Rolle verschoben worden sein; dann wird sie übersprungen und der
    Grund protokolliert.
  - **Prüfen:** Test verschiebt im Doppel eine Rolle nach oben und erwartet
    Überspringen plus Protokolleintrag.
  - **Dateien:** `src/automatik/rollenregel.mjs`, `tests/einheit/rollenregel.test.mjs`

### Kontrollpunkt G — **Dein erster echter Nutzen**
- [ ] Willkommensnachricht, Rollen-Nachrichten und Rollenregeln eingerichtet und aktiv.
- [ ] Ein echter Beitritt auf deinem Server löst die DM mit Bild aus.
- [ ] **Dir zeigen:** Alle drei Automatikseiten, plus eine echte Test-DM an dich.

---

## Phase 8 — Aktionsleisten

- [ ] **46 · Modell, Buttons gestalten, Reihenfolge** — M · hängt ab von: 20
  - **Abnahme:** `/aktionsleisten` mit Beschriftung, Emoji, einer von vier
    Discord-Farben, Farbpunkt in der Liste.
  - **Abnahme:** Reihenfolge änderbar; die Oberfläche zeigt sichtbar, wo Discord
    ab dem sechsten Button eine zweite Reihe beginnt.
  - **Prüfen:** Test für sechs Buttons: Aufteilung 5 + 1 in der Vorschau.
  - **Dateien:** `src/aktionen/modell.mjs`, `src/web/seiten/aktionsleisten.mjs`,
    `src/daten/aktionsleisten.mjs`, `tests/integration/aktionsleisten.test.mjs`

- [ ] **47 · Ausführungskette** — M · hängt ab von: 46, 14 · **100 % Abdeckung**
  - **Abnahme:** Aktionen laufen nacheinander; jede Aktionsart ist eine Einheit mit
    gleicher Schnittstelle — die Kette kennt keine einzelne Art.
  - **Abnahme:** Bei einem Fehler bricht sie ab, protokolliert den Grund und meldet
    dem Klickenden verständlich, was nicht ging. Bestätigungstext sieht nur er (ephemer).
  - **Prüfen:** Tests für: Kette mit drei Aktionen läuft durch; Fehler in der Mitte
    bricht ab und die dritte läuft nicht; unbekannte Aktionsart wird sauber abgelehnt.
    Abdeckung `src/aktionen/kette.mjs` = 100 %.
  - **Dateien:** `src/aktionen/kette.mjs`, `src/aktionen/arten/index.mjs`,
    `tests/einheit/kette.test.mjs`

- [ ] **48 · Aktion: DM an Klickenden oder an eine Person** — M · hängt ab von: 47, 34
  - **Abnahme:** DM an den Klickenden mit eigenem Text, Embed, Bildvorlage und
    optional einer weiteren Aktionsleiste darunter.
  - **Abnahme:** DM an eine feste Person oder an eine beim Klick gewählte Person,
    wahlweise auf eine Rolle eingegrenzt. Zusätzliche Platzhalter benennen
    Klickenden und Empfänger getrennt.
  - **Prüfen:** Tests für beide Ziele, für die Rolleneingrenzung, für die
    getrennten Platzhalter.
  - **Dateien:** `src/aktionen/arten/dm.mjs`, `tests/einheit/aktion-dm.test.mjs`

- [ ] **49 · Aktion: Rolle geben, entfernen, umschalten** — S · hängt ab von: 47, 12
  - **Abnahme:** Alle drei Varianten; Umschalten ergibt Selbstbedienungs-Rollen.
  - **Abnahme:** Fehlt dem Bot das Recht, wird die Aktion abgelehnt und der Grund
    genannt — im Panel vorab und beim Klick im Klartext.
  - **Prüfen:** Tests für alle drei Varianten plus fehlendes Recht.
  - **Dateien:** `src/aktionen/arten/rolle.mjs`, `tests/einheit/aktion-rolle.test.mjs`

- [ ] **50 · Aktion: Rückmeldung erfragen** — M · hängt ab von: 47, 14
  - **Abnahme:** Öffnet Discords Eingabefenster mit bis zu fünf Feldern.
  - **Abnahme:** Die Antworten stehen den **folgenden** Aktionen desselben Buttons
    als `{feedback}` zur Verfügung und werden mit Name der Person gespeichert.
  - **Prüfen:** Test: Kette „Rückmeldung → DM" setzt `{feedback}` korrekt in die DM ein.
  - **Dateien:** `src/aktionen/arten/rueckmeldung.mjs`, `src/daten/rueckmeldungen.mjs`,
    `tests/einheit/aktion-rueckmeldung.test.mjs`

- [ ] **51 · Aktion: Klickenden kicken** — S · hängt ab von: 47, 12
  - **Abnahme:** Mit Rückfrage, auf Wunsch mit einer Rolle als Ausweg (wer sie hat,
    wird nicht gekickt).
  - **Abnahme:** Das Panel warnt vorab, wenn dem Bot das Recht fehlt.
  - **Prüfen:** Tests für Kick, für Ausweg-Rolle, für fehlendes Recht.
  - **Dateien:** `src/aktionen/arten/kick.mjs`, `tests/einheit/aktion-kick.test.mjs`

- [ ] **52 · Klickberechtigung und Nur-einmal-Sperre** — M · hängt ab von: 47
  - **Abnahme:** Je Button auf bestimmte Rollen eingrenzbar; nichts gewählt heisst alle.
  - **Abnahme:** „Nur einmal je Mitglied" mit Zähler, wie oft geklickt wurde, und
    einem Knopf, der die Sperre wieder löst.
  - **Prüfen:** Tests: zweiter Klick abgelehnt; nach Zurücksetzen wieder erlaubt;
    Klick ohne erlaubte Rolle abgelehnt.
  - **Dateien:** `src/aktionen/sperre.mjs`, `src/daten/klicksperren.mjs`,
    `tests/einheit/sperre.test.mjs`

- [ ] **53 · Vorschau, Warnungen, Anhängen** — S · hängt ab von: 52, 23
  - **Abnahme:** Die Leiste wie in Discord in der Vorschau; daneben der Hinweis,
    wenn ein Button noch keine Aktion hat — ein Klick darauf täte nichts.
  - **Abnahme:** Aktionsleiste an eine Nachricht anhängbar (auch an Willkommens-
    und Rollen-Nachrichten).
  - **Prüfen:** Test für die Warnung; Test, dass eine angehängte Leiste beim Versand
    mitgeht.
  - **Dateien:** `src/web/seiten/aktionsleisten.mjs`, `src/nachricht/modell.mjs`,
    `tests/integration/leiste-anhaengen.test.mjs`

### Kontrollpunkt H — Aktionsleisten
- [ ] Eine Kette „Rückmeldung erfragen → Rolle umschalten → DM an den Klickenden"
      läuft auf deinem Server komplett durch.
- [ ] **Dir zeigen:** Diese Kette, live geklickt.

---

## Phase 9 — Übersicht, Protokoll, Rückmeldungen

- [ ] **54 · Protokollseite** — M · hängt ab von: 18, 16
  - **Abnahme:** Fünf Filter mit Zahl: Alle, Nachrichten, Rollen, Anmeldungen, Fehler.
    Die Zuordnung der Vorgangsarten wird hier festgelegt und dir gezeigt.
  - **Abnahme:** Volltextsuche nach Person, Kanal oder Vorgang; der Suchbegriff steht
    in der Adresse und lässt sich weitergeben. Nach Tagen gruppiert: Heute, Gestern,
    dann das Datum. 50 Einträge je Seite.
  - **Abnahme:** Grund im Klartext, nie als Fehlernummer.
  - **Prüfen:** Integrationstests für Filter, Suche in der Adresse, Tagesgruppen,
    Seitengrenze.
  - **Dateien:** `src/web/seiten/protokoll.mjs`, `tests/integration/protokoll.test.mjs`

- [ ] **55 · Rückmeldungsseite mit CSV** — M · hängt ab von: 50, 16
  - **Abnahme:** Antworten mit Frage und Person; die Seite sagt ausdrücklich, dass
    mit Namen gespeichert wird.
  - **Abnahme:** Filter je Button, auch für Buttons, die es nicht mehr gibt.
    CSV-Export. Einzeln löschen mit Rückfrage.
  - **Prüfen:** Test für CSV-Inhalt inklusive Maskierung von Semikolon und
    Zeilenumbruch in einer Antwort; Test für den Filter auf einen gelöschten Button.
  - **Dateien:** `src/web/seiten/rueckmeldungen.mjs`, `src/protokoll/csv.mjs`,
    `tests/integration/rueckmeldungen.test.mjs`

- [ ] **56 · Übersichtsseite** — M · hängt ab von: 54, 45, 53
  - **Abnahme:** Vier Fragen in dieser Reihenfolge: Ging etwas schief? Steht etwas
    quer? Laufen die Automatiken? Was war zuletzt?
  - **Abnahme:** Vier Kennzahlen mit Deutungszeile (zugestellt / fehlgeschlagen in
    24 h, gespeicherte Nachrichten, aktive Rollenregeln).
  - **Abnahme:** „Braucht Aufmerksamkeit": fehlgeschlagene Versände, abgeschaltete
    Regeln, ausgeschaltete Willkommensnachricht, unbenutzte Bildvorlagen — je mit
    dem Weg dorthin. Automatiken mit Zustand, fünf jüngste Vorgänge.
  - **Prüfen:** Test baut jeden Aufmerksamkeitsfall einzeln und erwartet ihn samt Link.
  - **Dateien:** `src/web/seiten/uebersicht.mjs`, `src/protokoll/kennzahlen.mjs`,
    `tests/integration/uebersicht.test.mjs`

### Kontrollpunkt I — Nachvollziehbarkeit
- [ ] Jede Aktion der letzten Phasen steht im Protokoll, mit Zeit, Person, Ergebnis.
- [ ] **Dir zeigen:** Übersicht mit echten Zahlen von deinem Server.

---

## Phase 10 — Setup und Auslieferung

- [ ] **57 · Interaktives Setup-Skript** — M · hängt ab von: 2, 5
  - **Abnahme:** Fragt Bot-Token, Client-ID, Client-Secret, Gilden-ID,
    Owner-Discord-ID, Erreichbarkeit (IP oder Domain) und Port ab.
  - **Abnahme:** Schreibt `.env` mit Rechten 600, erzeugt den Sitzungsschlüssel
    zufällig, legt die Datenbank an, führt Migrationen aus.
  - **Abnahme:** Gibt Redirect-URI und Einladungs-URL zum Kopieren aus; bietet
    systemd-Autostart an und nennt bei Ablehnung das Startkommando.
  - **Abnahme:** Ein zweiter Lauf überschreibt vorhandene Werte nicht ungefragt.
  - **Prüfen:** Test fährt das Skript mit vorgegebenen Antworten und prüft `.env`,
    Dateirechte, Datenbank und die ausgegebenen URLs.
  - **Dateien:** `setup.mjs`, `src/kern/systemd.mjs`, `tests/integration/setup.test.mjs`

- [ ] **58 · Betriebsanleitung und Prüfung auf ARM64** — S · hängt ab von: 57
  - **Abnahme:** `README.md` mit der Drei-Zeilen-Installation, der Anleitung für
    die Discord-Application, dem Weg von IP zu Domain und einer Betriebs-Checkliste
    für das, was nicht automatisiert testbar ist.
  - **Abnahme:** `docs/betrieb.md` mit Oracle-Always-Free-Besonderheiten:
    Firewall-Regeln, Node installieren, Port freigeben, Sicherung der `panel.db`.
  - **Prüfen:** Die Schritte werden auf einer ARM64-Umgebung nachvollzogen; das
    Ergebnis des Renderer-Tests dort wird festgehalten.
  - **Dateien:** `README.md`, `docs/betrieb.md`

- [ ] **59 · Abgleich gegen das Artifact** — S · hängt ab von: 56, 58
  - **Abnahme:** Jeder Punkt aus der ursprünglichen Funktionsliste wird einzeln
    gegen die gebaute Seite geprüft und abgehakt; Abweichungen werden benannt,
    nicht stillschweigend gelassen.
  - **Abnahme:** Weiterleitungen `/dm` und `/kanaele` bestätigt; alle neun Seiten
    ohne JavaScript bedienbar.
  - **Prüfen:** Abgleichliste in `docs/abgleich.md`, jede Zeile mit Ergebnis.
  - **Dateien:** `docs/abgleich.md`, ggf. Nachbesserungen

### Kontrollpunkt J — Auslieferung
- [ ] Alle neun Erfolgskriterien aus `docs/SPEC.md` Abschnitt 12 erfüllt.
- [ ] **Danach Schritt 5 der Gesamtaufgabe:** `code-review-and-quality` und
      `security-and-hardening` über das Ganze.
