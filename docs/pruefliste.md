# Prüfliste für die erste echte Installation

Diese Liste geht der Reihe nach durch, was sich nur auf einem echten Server
zeigt. Sie ist absichtlich in der Reihenfolge geschrieben, in der ein Fehler
den nächsten Punkt unmöglich macht: Bleibt einer stehen, hat es keinen Sinn,
weiterzuklicken.

**Zu jedem Punkt steht, was ich von dir brauche, wenn er nicht klappt.** Je
genauer, desto schneller finde ich es — „geht nicht“ kostet uns beide eine
Runde.

Zum Installieren: [Hetzner](installation-vorab-hetzner.md) oder
[Oracle Cloud](installation-vorab.md).

---

## 0 · Vorher: Was es noch nicht gibt

Die Seitenleiste zeigt drei Seiten, die **404** liefern — das ist kein Fehler,
sie kommen in den Schritten 54 bis 56:

- Protokoll
- Rückmeldungen
- Zugriff

Ohne die Zugriffsseite bist **nur du** im Panel, über `OWNER_DISCORD_ID`. Für
eine erste Prüfung reicht das; Moderatoren freischalten geht noch nicht.

Ebenso fehlt `npm run setup` (Schritt 57) — die `.env` schreibst du von Hand,
so wie in der Anleitung beschrieben.

---

## 1 · Installation läuft durch

```
npm ci --omit=dev
```

**Erwartet:** Läuft ohne Fehler durch. Auf einem ARM-Server (Oracle, Hetzner
CAX) wird dabei `@napi-rs/canvas` für ARM64 geladen — das ist der Punkt, an dem
sich das grösste Risiko des Plans entscheidet.

**Wenn nicht:** Schick mir die letzten 20 Zeilen der Ausgabe und
`uname -m` sowie `node --version`.

---

## 2 · Das Panel startet

```
npm start
```

**Erwartet:** Eine Zeile `"meldung":"Panel läuft"` mit deiner Adresse. Kurz
danach entweder nichts weiter (Bot verbunden) oder eine Fehlerzeile zum Token.

**Wenn die `.env` unvollständig ist,** startet das Panel absichtlich **nicht**
und nennt jede fehlende Variable einzeln. Das ist kein Fehler, sondern die
Meldung, die du brauchst.

**Wenn nicht:** Die ganze Ausgabe. Sie enthält keine Geheimnisse — Token,
Client Secret und Sitzungsschlüssel werden im Log maskiert.

---

## 3 · Anmelden

`http://DEINE-IP:3000` im Browser.

**Erwartet:**

| Was du tust | Was passieren soll |
|---|---|
| `/` aufrufen | Umleitung auf `/login` |
| „Mit Discord anmelden“ | Discord fragt nach `identify`, danach bist du drin |
| Kopfzeile oben | **Bot verbunden** mit grünem Punkt |
| Neustart (`Strg+C`, `npm start`) | Du bleibst angemeldet |

**Wenn nicht:** Die Fehlermeldung im Browser **und** die Zeile im Terminal.
Bei „Invalid OAuth2 redirect_uri“: vergleiche den Redirect im Discord-Portal
zeichengenau mit `PANEL_URL` + `/auth/callback`.

---

## 4 · Der Bot sieht deinen Server

Geh auf **Nachricht** und tippe im Empfängerfeld einen Buchstaben.

**Erwartet:** Mitglieder **und** Rollen tauchen als Treffer auf. Wechsle auf
den Reiter **Kanal**: Deine Textkanäle stehen da, nach Kategorien sortiert.
Kanäle, in denen der Bot nicht schreiben darf, stehen ebenfalls da — mit dem
Grund daneben, statt zu fehlen.

**Wenn die Mitgliederliste leer bleibt:** Der **Server Members Intent** ist
nicht eingeschaltet (Discord-Portal → Bot → Privileged Gateway Intents). Das
ist der häufigste Fall.

---

## 5 · Eine Direktnachricht an dich selbst

Auf **Nachricht**: Text mit `{user}` und `{guild}` schreiben, dich selbst als
Empfänger wählen, senden.

**Erwartet:** Rückfrage, dann die Fortschrittsseite, dann die Nachricht in
deinen Discord-DMs — mit eingesetztem Namen und Servernamen.

**Wenn nicht:** Was auf der Fortschrittsseite unter „Nicht erreicht“ steht.
Der Grund sollte im Klartext dastehen, nicht als Zahl.

---

## 6 · Eine Bildvorlage mit deinem echten Profilbild

Auf **Bildvorlagen** → *Neue Vorlage*:

1. Eine Textzeile mit `Willkommen, {user}!`
2. Profilbild einsetzen ankreuzen
3. Unter der Vorschau bei **Vorschau mit einem echten Mitglied** deinen Namen
   suchen und auswählen

**Erwartet:** Die Vorschau zeigt dein echtes Discord-Profilbild und deinen
Namen. Ist der Name lang, schrumpft die Schrift, statt über den Rand zu laufen.

**Das ist der Punkt, den ich am wenigsten prüfen konnte:** Das Profilbild holt
das Panel von `cdn.discordapp.com`. Gegen echtes Discord ist das noch nie
gelaufen.

**Wenn stattdessen „Das Profilbild liess sich nicht von Discord laden“
dasteht:** Sag mir das — dann liegt es an meinem Abruf, nicht an dir. Hilfreich
wäre: Kommt der Server sonst ins Netz (`curl -sI https://cdn.discordapp.com`)?

---

## 7 · Die Willkommensnachricht

Auf **Willkommen**: Text schreiben, die Bildvorlage aus Punkt 6 auswählen,
**Test-DM an mich** drücken.

**Erwartet:** „Gespeichert und als Test an dich verschickt“, und in deinen DMs
liegt die Nachricht **mit dem erzeugten Bild**, auf dem dein Name und dein
Profilbild stehen.

**Danach:** Den Haken bei **Aktiv** setzen und speichern.

**Wenn nicht:** Die Meldung auf der Seite — sie sollte den Grund im Klartext
nennen.

---

## 8 · Ein echter Beitritt

Der Punkt, den nur ein zweites Konto beantworten kann: Lass jemanden beitreten,
oder nimm ein Zweitkonto.

**Erwartet:** Die neue Person bekommt die Willkommensnachricht mit **ihrem**
Namen und **ihrem** Profilbild — nicht deinem.

**Wenn nichts ankommt:** Prüfe, ob die Person Direktnachrichten von
Servermitgliedern annimmt (Discord: Privatsphäre-Einstellungen). Das ist der
häufigste Grund, und das Panel kann nichts dagegen tun. Schick mir sonst die
Terminalausgabe aus dem Moment des Beitritts.

---

## 9 · Eine Rollen-Nachricht

Auf **Rollen-Nachrichten**: Eine Rolle wählen, Text mit `{role}` schreiben,
aktiv setzen, speichern. Dann gib dir selbst diese Rolle in Discord.

**Erwartet:** Die Nachricht kommt an, `{role}` steht für die Rolle.

**Zusatzprobe:** Nimm dir die Rolle wieder weg. Es darf **nichts** passieren.
Ändere deinen Servernamen. Es darf ebenfalls nichts passieren.

---

## 10 · Eine Rollenregel

Auf **Rollenregeln**: „Wer *A* erhält, verliert *B*.“ Aktiv setzen. Gib dir
*B*, dann *A*.

**Erwartet:** *B* verschwindet von selbst.

**Wichtig:** Die Bot-Rolle muss in Discords Rollenliste **über** *B* stehen.
Steht sie darunter, sperrt das Panel die Rolle schon bei der Auswahl und nennt
den Grund — genau dafür ist die Sperre da.

---

## Was ich am Ende von dir brauche

Am liebsten eine Liste wie:

```
1 ok
2 ok
3 ok
4 ok
5 ok
6 Bild kam nicht — Meldung: „…“
7 …
```

Punkte, die du überspringst (etwa 8, wenn du kein Zweitkonto hast), einfach als
„übersprungen“ nennen. Alles, was klemmt, notiere ich als Fehler und behebe es,
bevor ich weiterbaue.
