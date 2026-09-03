# Vorab-Installation auf Hetzner (Stand: nach Schritt 47)

Zweite Anleitung neben [`installation-vorab.md`](installation-vorab.md) (Oracle
Cloud). Beide führen zum selben Ergebnis; unterschiedlich sind nur Abschnitt 1
bis 3 — die Maschine, das Netz und die Firewall. Ab Abschnitt 4 sind sie
identisch, deshalb ist diese Anleitung vollständig und nicht nur ein Anhang.

Das bequeme `npm run setup` kommt in Schritt 57. Bis dahin schreibst du die
`.env` einmal von Hand.

> **Wenn du prüfen willst, ob alles läuft:** Die
> [Prüfliste](pruefliste.md) geht Punkt für Punkt durch, was sich nur auf einem
> echten Server zeigt — und sagt zu jedem, was ich brauche, wenn er klemmt.

## Hetzner statt Oracle — was du dafür eintauschst

| | Oracle Always Free | Hetzner Cloud |
|---|---|---|
| Preis | dauerhaft kostenlos | kostenpflichtig, kleinste Maschine wenige Euro im Monat, IPv4-Adresse kostet extra |
| Verfügbarkeit | ARM-Kapazität in beliebten Regionen oft „out of capacity" | sofort verfügbar |
| Netz ab Werk | alles zu, zwei Firewalls sind zu öffnen | alles offen, du solltest zumachen |
| Standort | je nach Region | Nürnberg, Falkenstein, Helsinki (EU) |

Die aktuellen Preise stehen im Preisrechner von Hetzner — die Zahlen ändern
sich, deshalb stehen hier keine.

**Der wichtigste Unterschied ist die letzte Zeile der Tabelle.** Auf Oracle
vergisst man, den Port zu öffnen, und das Panel ist nicht erreichbar. Auf
Hetzner vergisst man, die anderen Ports zu schliessen, und der Server steht
offen im Netz. Abschnitt 3 ist deshalb hier kein Zubehör, sondern Pflicht.

---

## 1. Server anlegen

In der Hetzner Cloud Console <https://console.hetzner.cloud> ein Projekt
anlegen, dann **Server hinzufügen**:

1. **Standort:** Nürnberg, Falkenstein oder Helsinki. Alle drei liegen in der
   EU; nimm den, der dir am nächsten ist.
2. **Image:** Ubuntu 24.04.
3. **Typ:**
   - **CAX11** (ARM64, Ampere) — dieselbe Architektur wie Oracle, günstiger.
   - **CX22** (x86) — nimm den, falls du ARM aus dem Weg gehen willst.

   Beides reicht für das Panel deutlich aus. Die Datenbank ist eine Datei, es
   läuft kein Docker und kein nginx.
4. **Netzwerk:** **IPv4 und IPv6** ankreuzen.

   > Ohne IPv4 ist der Server nur über IPv6 erreichbar. Der Discord-Login
   > läuft über *deinen* Browser — hat dein Anschluss zu Hause kein IPv6,
   > kommst du gar nicht erst auf die Anmeldeseite. Die IPv4-Adresse kostet
   > einen kleinen monatlichen Betrag; spar ihn dir nicht an dieser Stelle.
5. **SSH-Key:** deinen öffentlichen Schlüssel hinterlegen. Wählst du stattdessen
   ein Passwort, schickt Hetzner es dir per Mail — und der Server nimmt
   Passwort-Anmeldungen an, die von der ersten Minute an durchprobiert werden.

Nach dem Erstellen zeigt die Console die **IPv4-Adresse**. Die brauchst du
gleich zweimal: für den Discord-Redirect und für `PANEL_URL`.

```
ssh root@DEINE-SERVER-IP
```

---

## 2. Discord-Application anlegen

Das ist auf jedem Hoster gleich. Im Entwicklerportal
<https://discord.com/developers/applications>:

1. **New Application** → Namen vergeben.
2. Reiter **Bot** → *Reset Token* → Token kopieren. Das ist `DISCORD_TOKEN`.
3. Reiter **OAuth2** → *Client ID* und *Client Secret* kopieren.
   Das sind `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET`.
4. Ebenfalls unter **OAuth2** → *Redirects* → **Add Redirect** und exakt
   eintragen:

   ```
   http://DEINE-SERVER-IP:3000/auth/callback
   ```

   Muss zeichengenau mit `PANEL_URL` + `/auth/callback` übereinstimmen —
   sonst lehnt Discord den Anmeldecode ab. Auch `http` vs. `https` und der
   Port zählen mit.

### Bot auf den Server einladen

Anders als beim ersten Zwischenstand ist das jetzt nötig: Ohne Bot auf dem
Server sieht das Panel keine Kanäle, keine Rollen und keine Mitglieder.

Unter **OAuth2 → URL Generator**: Scopes `bot` und `applications.commands`,
dann die Rechte *Send Messages*, *Embed Links*, *Attach Files*, *Read Message
History*, *View Channels*. Die erzeugte Adresse öffnen und den Bot auf deinen
Server einladen.

Zusätzlich im Reiter **Bot** unter *Privileged Gateway Intents* den
**Server Members Intent** einschalten. Ohne ihn kennt der Bot die
Mitgliederliste nicht — die Empfängersuche bliebe leer.

### Die beiden IDs aus Discord

In Discord: *Einstellungen → Erweitert → Entwicklermodus* einschalten. Dann
Rechtsklick auf deinen Server → **Server-ID kopieren** (`GUILD_ID`), und
Rechtsklick auf dein eigenes Profil → **Benutzer-ID kopieren**
(`OWNER_DISCORD_ID`).

`OWNER_DISCORD_ID` ist entscheidend: Dieses Konto ist Owner und darf alles —
unabhängig von jeder Rolle auf dem Server.

---

## 3. Firewall — hier wird zugemacht, nicht aufgemacht

Ein frischer Hetzner-Server ist **von aussen vollständig offen**: Die Cloud
Firewall ist optional und standardmäßig nicht aktiv, und `ufw` auf dem
Ubuntu-Image ist es ebenfalls nicht. Port 3000 wäre also sofort erreichbar —
zusammen mit allem anderen, was du je startest.

Leg deshalb in der Console unter **Firewalls** eine Firewall an und weise sie
dem Server zu. Zwei eingehende Regeln reichen:

| Port | Quelle | Wofür |
|---|---|---|
| 22 (TCP) | **nur deine eigene IP** | SSH |
| 3000 (TCP) | `0.0.0.0/0` und `::/0` | das Panel |

Ausgehend darf alles raus — der Bot muss Discord erreichen.

> **Zu Port 22:** Wenn du keine feste IP zu Hause hast, wird das lästig. Dann
> nimm `0.0.0.0/0`, aber schalte in `/etc/ssh/sshd_config` die
> Passwort-Anmeldung ab (`PasswordAuthentication no`, danach
> `systemctl restart ssh`) und melde dich nur mit dem SSH-Key an.

Die Cloud Firewall genügt; `ufw` brauchst du zusätzlich nicht. Schaltest du es
trotzdem ein, gib **vor** dem Aktivieren 22 und 3000 frei — sonst sperrst du
dich aus, und der einzige Weg zurück ist die Notfall-Konsole.

---

## 4. Node installieren

Gebraucht wird mindestens **Node 22.13**, empfohlen **24 LTS**:

```
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version    # muss v22.13 oder höher zeigen
uname -m          # aarch64 = ARM (CAX), x86_64 = Intel/AMD (CX)
```

Mehr ist nicht zu installieren: keine Datenbank, kein Docker, kein nginx, keine
Schriften — die bringt das Panel mit.

---

## 5. Panel installieren

```
git clone -b claude/discord-bot-webpanel-zgba72 \
  https://github.com/MurmiStudios/Discord-Bot-2.0.git
cd Discord-Bot-2.0
npm ci --omit=dev
```

`--omit=dev` lässt ESLint weg — das braucht nur die Entwicklungsmaschine.

> **Auf einem CAX-Server nebenbei ein echter Test:** Hier wird
> `@napi-rs/canvas` für ARM64 geladen, das Paket hinter den Bildvorlagen.
> Läuft der Befehl durch, ist Risiko 1 aus dem Plan auch auf Hetzner-ARM
> entschärft. Sag mir, falls hier etwas schiefgeht.

---

## 6. `.env` schreiben

Sitzungsschlüssel erzeugen:

```
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Dann `.env` anlegen (`nano .env`) und ausfüllen:

```
DISCORD_TOKEN=dein-bot-token
DISCORD_CLIENT_ID=deine-client-id
DISCORD_CLIENT_SECRET=dein-client-secret
GUILD_ID=deine-server-id
OWNER_DISCORD_ID=deine-benutzer-id
PANEL_URL=http://DEINE-SERVER-IP:3000
SESSION_SECRET=der-eben-erzeugte-wert
PORT=3000
TRUST_PROXY=0
```

Rechte einschränken, damit der Token nicht für jeden lesbar ist:

```
chmod 600 .env
```

---

## 7. Starten

```
npm start
```

Erwartete Ausgabe:

```
{"zeit":"...","stufe":"info","bereich":"start","meldung":"Panel läuft",
 "daten":{"adresse":"http://DEINE-IP:3000","port":3000,"sicheresCookie":false}}
```

Fehlt etwas in der `.env`, startet das Panel **nicht** — es nennt stattdessen
jede fehlende Variable einzeln und sagt, wo ihr Wert herkommt. Das ist gewollt.

> **`npm start` läuft im Vordergrund.** Schliesst du die SSH-Sitzung, ist das
> Panel weg. Für den Zwischenstand reicht `tmux new -s panel`, darin `npm start`
> und dann `Strg+B`, `D` zum Loslösen (`tmux attach -t panel` holt dich zurück).
> Der richtige Dauerbetrieb als systemd-Dienst kommt in Schritt 58.

---

## 8. Ausprobieren

Im Browser `http://DEINE-IP:3000` öffnen.

**Was heute funktioniert:**

| Seite | Was du tun kannst |
|---|---|
| `/login` | Anmelden mit Discord. Fremde Konten sehen die Abweisungsseite. |
| `/` | Platzhalter-Übersicht mit Bot-Status in der Kopfzeile. Die richtige kommt in Schritt 56. |
| `/nachricht` | Direktnachricht und Kanalnachricht, mit Embed, Variablen, Bildvorlage und Vorschau. |
| Senden | Rückfrage vor dem Versand, danach eine Fortschrittsseite, die auch ohne JavaScript aktuell bleibt. |
| `/nachrichten` | Gespeicherte Nachrichten: wiederfinden, öffnen, kopieren, umbenennen, löschen. |
| `/willkommen` | Willkommensnachricht samt Aktiv-Schalter und „Test-DM an mich“. |
| `/rollen-nachrichten` | Eine Nachricht je Rolle, mit „Jetzt an alle“. |
| `/rollenregeln` | „Wer X erhält, verliert Y“ — mit Sperren für unerreichbare Rollen. |
| `/aktionsleisten` | Knopfleisten bauen (was die Knöpfe tun, kommt in den Schritten 48–52). |
| `/vorlagen` | Bildvorlagen anlegen, bearbeiten, löschen — mit Vorschau vom Server. |
| `/suche` | Seitensuche über die Taste `/`. |

**Und automatisch, ohne dass jemand das Panel offen hat:** Ein Beitritt löst die
Willkommensnachricht aus, ein Rollenerhalt die zugehörige Rollen-Nachricht und
die Rollenregeln.

**Was heute noch nicht funktioniert:** Drei Seiten der Seitenleiste gibt es noch
nicht und sie antworten mit 404 — **Protokoll**, **Rückmeldungen** und
**Zugriff**. Sie kommen in den Schritten 54 bis 56. Ohne die Zugriffsseite bist
nur du im Panel, über `OWNER_DISCORD_ID`; Moderatoren freischalten geht noch
nicht.

Ein Neustart (`Strg+C`, dann `npm start`) darf dich **nicht** abmelden — die
Sitzung liegt in der Datenbank.

---

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| Seite lädt gar nicht | Cloud Firewall lässt 3000 nicht durch, oder `npm start` läuft nicht mehr (SSH-Sitzung geschlossen — siehe Abschnitt 7). |
| Seite lädt nur von manchen Anschlüssen | Der Server hat keine IPv4-Adresse. Abschnitt 1, Punkt 4. |
| Discord: „Invalid OAuth2 redirect_uri" | Redirect im Portal ≠ `PANEL_URL` + `/auth/callback`. Zeichengenau vergleichen, auch `http` vs. `https` und den Port. |
| „Discord antwortet nicht wie erwartet" nach dem Anmelden | Client Secret falsch, oder Redirect-URI stimmt nicht. |
| „Du hast hier keinen Zugriff" bei dir selbst | `OWNER_DISCORD_ID` ist nicht deine Benutzer-ID (nicht die Server-ID!). |
| Kopfzeile sagt „Bot nicht verbunden" | Der Grund steht direkt daneben. Meist ein falscher oder zurückgesetzter Token. |
| Empfängersuche findet niemanden | Server Members Intent nicht eingeschaltet (Abschnitt 2), oder der Bot ist nicht auf dem Server. |
| Kanal fehlt in der Auswahl | Der Bot darf dort nicht schreiben. Das Panel blendet solche Kanäle nicht aus, sondern sagt es. |
| Start bricht mit Meldung ab | Genau das soll er. Die Meldung nennt die fehlende Variable. |

---

## Aufräumen

Der Zwischenstand legt nur `speicher/` (Datenbank und hochgeladene
Hintergrundbilder) und `.env` an. Beides liegt im Projektordner; ein
`rm -rf Discord-Bot-2.0` entfernt alles restlos. Den Server selbst löschst du in
der Console — solange er existiert, kostet er.
