# Implementierungsplan: Discord-Panel 2.0

Grundlage: `docs/SPEC.md` (freigegeben am 2026-08-30).
Aufgabenliste: `tasks/todo.md` — 59 nummerierte Arbeitsschritte in 10 Phasen.

---

## Überblick

Bot und Panel entstehen in zehn Phasen entlang der Baureihenfolge der
Fähigkeitskarte. Jede Phase endet mit einem Kontrollpunkt, an dem Tests grün
sind, das Projekt startet und du siehst, was fertig ist.

Die Reihenfolge ist so gewählt, dass **Phase 7 dein erster echter Nutzen ist**:
Danach kannst du Willkommensnachricht, Rollen-Nachrichten und Rollenregeln
einrichten und sie gehen wirklich raus — mit Bild, mit Platzhaltern, mit
gespeicherten Vorlagen. Die Aktionsleisten (Phase 8) und die Auswertung
(Phase 9) bauen darauf auf.

---

## Architekturentscheidungen

**Ein Prozess, zwei Gesichter.** Bot und Webserver teilen sich Prozess, Datenbank
und Guild-Cache. Der Bot ist kein Dienst, den das Panel über eine Schnittstelle
anspricht, sondern ein Modul im selben Speicher. Das spart die gesamte
Zwischenschicht — und ist der Grund, warum ein Neustart einen laufenden
Massenversand abbricht.

**Discord nur hinter einer Wand.** Kein `client.` ausserhalb von `src/discord/`.
Jedes andere Modul spricht mit einem schmalen Adapter, der im Test durch ein
Doppel ersetzt wird. Ohne diese Regel wäre nichts ohne echten Discord-Server
testbar.

**HTML ohne Engine.** Eine `html`-Tag-Funktion mit Auto-Escaping statt einer
Template-Bibliothek. Damit ist Maskieren die Vorgabe statt etwas, das man
vergessen kann — und die CSP ohne Inline-Code lässt sich überhaupt einhalten.

**Formular zuerst, JavaScript darüber.** Jede Seite wird zuerst als reines
Formular gebaut und getestet. JavaScript verbessert danach dieselbe Seite
(Live-Vorschau, Ziehen, Chips), ersetzt sie nie. Ein zweiter Codepfad entsteht
dabei nicht.

**`guild_id` von Anfang an.** Jede Tabelle und jede Repository-Funktion trägt sie,
auch solange nur ein Server existiert. Nachträglich wäre es eine Migration über
sechzehn Tabellen.

**Die Kette ist ein Modul, keine Verzweigungskaskade.** Aktionsleisten führen
Schritte nacheinander aus; jede Aktionsart ist eine austauschbare Einheit mit
gleicher Schnittstelle. Deshalb liegt die 100-%-Testuntergrenze auf
`aktionen/kette.mjs` und nicht auf den einzelnen Aktionen.

---

## Phasen und Kontrollpunkte

| Phase | Inhalt | Schritte | Kontrollpunkt |
|---|---|---|---|
| 0 | Gerüst, Konfiguration, Logger | 1–3 | Projekt startet, Tests laufen |
| 1 | Datenbank und Anmeldung | 4–10 | **A** — Du kannst dich anmelden |
| 2 | Bot, Guild-Cache, Grundoberfläche | 11–18 | **B** — Bot-Status in der Kopfzeile |
| 3 | Nachrichtenbaukasten | 19–25 | **C** — Nachricht schreiben mit Vorschau |
| 4 | Versand | 26–28 | **D** — Erste echte DM |
| 5 | Bildvorlagen | 29–34 | **E** — Bild mit deinem Profilbild |
| 6 | Gespeicherte Nachrichten | 35–38 | **F** — Vorlagenbibliothek |
| 7 | Automatiken | 39–45 | **G** — **Dein Einrichtungstag** |
| 8 | Aktionsleisten | 46–53 | **H** — Buttons mit Ketten |
| 9 | Übersicht, Protokoll, Rückmeldungen | 54–56 | **I** — Alles nachvollziehbar |
| 10 | Setup-Skript und Auslieferung | 57–59 | **J** — Auf Oracle installierbar |

Nach Kontrollpunkt J folgt Schritt 5 der Gesamtaufgabe:
`code-review-and-quality` und `security-and-hardening` über das Ganze.

---

## Risiken

| Risiko | Wirkung | Gegenmassnahme |
|---|---|---|
| `@napi-rs/canvas` verhält sich auf ARM64 anders als hier auf x86_64 | Hoch — Bildvorlagen sind Pflichtumfang | Schritt 29 rendert gegen feste Erwartungswerte; die mitgelieferte Schrift schliesst Systemunterschiede aus. Wird in Schritt 58 auf der echten VM nachgeprüft |
| `node:sqlite` ist unter Node 22 als experimentell markiert | Mittel — API könnte sich ändern | Alle Datenbankzugriffe laufen durch `src/daten/`; ein Wechsel auf `better-sqlite3` wäre eine Datei. Empfehlung an dich bleibt Node 24 |
| Discord-Ratengrenzen beim Massenversand | Mittel — Versand bricht ab | `DM_DELAY_MS` als Vorgabe 1200 ms, Obergrenze `DM_MAX_RECIPIENTS`, Fehler 40003 wird erkannt und der Versand pausiert statt zu scheitern |
| Aktionsketten werden zur Verzweigungskaskade | Mittel — unwartbar und untestbar | Aktionsarten mit einheitlicher Schnittstelle, Kette kennt keine einzelne Art. 100 % Testabdeckung auf der Kette |
| Rechteprüfung wird an einer neuen Route vergessen | Hoch — offenes Panel | Schritt 8 baut einen Test, der die Routenliste gegen die Rechtematrix führt und bei jeder nicht zugeordneten Route fehlschlägt |
| Ohne echten Discord-Server bleibt der Versand ungetestet | Mittel | Testdoppel deckt die Logik ab; Schritt 41 (Test-DM an dich) ist der erste echte Beweis, Schritt 58 die Betriebs-Checkliste |

---

## Offene Punkte

Beide aus `docs/SPEC.md` Abschnitt 13, keiner blockiert:

1. Aussehen der Vorschau ohne JavaScript — wird in Schritt 23 gezeigt.
2. Zuordnung der Protokoll-Vorgangsarten zu den fünf Filtern — wird in
   Schritt 54 gezeigt.

---

## Definition of Done je Schritt

Ein Schritt gilt erst als fertig, wenn **alle** vier Punkte stimmen:

1. Der Test war zuerst da und schlug fehl, bevor der Code existierte.
2. `npm test` und `npm run lint` sind grün.
3. Die Abnahmebedingungen des Schrittes sind erfüllt — alle, nicht die meisten.
4. Der Schritt ist committet, mit einer Nachricht, die den Schritt nennt.
