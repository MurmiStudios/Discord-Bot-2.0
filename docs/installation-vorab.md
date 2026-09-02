# Vorab-Installation auf Oracle Cloud (geschrieben nach Schritt 10)

Diese Anleitung ist ein Zwischenstand, damit du das Panel schon jetzt auf
deinem Oracle-Server ausprobieren kannst. Das bequeme `npm run setup` kommt in
Schritt 57 — bis dahin schreibst du die `.env` einmal von Hand.

Für Hetzner gibt es dieselbe Anleitung mit anderem Abschnitt 1 bis 3:
[`installation-vorab-hetzner.md`](installation-vorab-hetzner.md).

> **Hinweis:** Der Text unten stammt aus der Zeit nach Schritt 10, als nur das
> Login stand. Die Schritte selbst stimmen weiterhin — es funktioniert
> inzwischen aber deutlich mehr als hier beschrieben. Welche Seiten heute
> gehen und welche noch 404 antworten, steht in Abschnitt 8 der
> Hetzner-Anleitung; für den Bot brauchst du zusätzlich die Einladung und den
> Server Members Intent aus deren Abschnitt 2.

---

## 1. Discord-Application anlegen

Im Entwicklerportal <https://discord.com/developers/applications>:

1. **New Application** → Namen vergeben.
2. Reiter **Bot** → *Reset Token* → Token kopieren. Das ist `DISCORD_TOKEN`.
3. Reiter **OAuth2** → *Client ID* und *Client Secret* kopieren.
   Das sind `DISCORD_CLIENT_ID` und `DISCORD_CLIENT_SECRET`.
4. Ebenfalls unter **OAuth2** → *Redirects* → **Add Redirect** und exakt
   eintragen:

   ```
   http://<DEINE-SERVER-IP>:3000/auth/callback
   ```

   Muss zeichengenau mit `PANEL_URL` + `/auth/callback` übereinstimmen —
   sonst lehnt Discord den Anmeldecode ab.

Für den Login braucht der Bot **noch nicht** auf deinem Server zu sein.

### Die beiden IDs aus Discord

In Discord: *Einstellungen → Erweitert → Entwicklermodus* einschalten. Dann
Rechtsklick auf deinen Server → **Server-ID kopieren** (`GUILD_ID`), und
Rechtsklick auf dein eigenes Profil → **Benutzer-ID kopieren**
(`OWNER_DISCORD_ID`).

`OWNER_DISCORD_ID` ist entscheidend: **Nur dieses Konto kommt derzeit herein.**
Alle anderen sehen die Abweisungsseite, weil das Panel ohne verbundenen Bot
noch keine Rollen kennt.

---

## 2. Node auf dem Server

Gebraucht wird mindestens **Node 22.13**, empfohlen **24 LTS**. Auf einer
frischen Oracle-Ubuntu-VM:

```
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version    # muss v22.13 oder höher zeigen
```

Mehr ist nicht zu installieren: keine Datenbank, kein Docker, kein nginx.

---

## 3. Port 3000 öffnen

Auf Oracle Cloud sind **zwei** Stellen nötig — das ist die häufigste
Stolperfalle:

1. **Security List / NSG in der Oracle-Konsole:** Ingress-Regel für TCP 3000
   aus `0.0.0.0/0`.
2. **Firewall auf der VM selbst:**

   ```
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
   sudo netfilter-persistent save
   ```

   (Auf Oracle-Linux/RHEL stattdessen:
   `sudo firewall-cmd --permanent --add-port=3000/tcp && sudo firewall-cmd --reload`)

---

## 4. Panel installieren

```
git clone -b claude/discord-bot-webpanel-zgba72 \
  https://github.com/MurmiStudios/Discord-Bot-2.0.git
cd Discord-Bot-2.0
npm ci --omit=dev
```

`--omit=dev` lässt ESLint weg — das braucht nur die Entwicklungsmaschine.

> **Nebenbei ein echter Test:** Bei diesem Schritt wird `@napi-rs/canvas` für
> ARM64 geladen. Läuft er durch, ist das größte Risiko aus dem Plan (Risiko 1,
> Bildvorlagen auf ARM) schon jetzt entschärft. Sag mir, falls hier etwas
> schiefgeht.

---

## 5. `.env` schreiben

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

## 6. Starten

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

---

## 7. Ausprobieren

Im Browser `http://DEINE-IP:3000` öffnen. Erwartetes Verhalten:

| Was du tust | Was passieren soll |
|---|---|
| `/` aufrufen | Umleitung auf `/login` |
| `/login` | Seite ohne Passwortfeld, mit „Mit Discord anmelden" |
| Anmelden als Owner | Zurück auf `/`, „Panel läuft — Angemeldet als …" |
| Anmelden mit anderem Konto | „Du hast hier keinen Zugriff" |
| Abmelden | Zurück zur Anmeldeseite, Sitzung serverseitig gelöscht |
| `/gibt-es-nicht` | 404 |

Ein Neustart (`Strg+C`, dann `npm start`) darf dich **nicht** abmelden — die
Sitzung liegt in der Datenbank.

---

## Wenn etwas klemmt

| Symptom | Ursache |
|---|---|
| Discord: „Invalid OAuth2 redirect_uri" | Redirect im Portal ≠ `PANEL_URL` + `/auth/callback`. Zeichengenau vergleichen, auch `http` vs `https` und den Port. |
| „Discord antwortet nicht wie erwartet" nach dem Anmelden | Client Secret falsch, oder Redirect-URI stimmt nicht. |
| Seite lädt gar nicht | Port 3000 ist zu — beide Stellen aus Abschnitt 3 prüfen. |
| „Du hast hier keinen Zugriff" bei dir selbst | `OWNER_DISCORD_ID` ist nicht deine Benutzer-ID (nicht die Server-ID!). |
| Start bricht mit Meldung ab | Genau das soll er. Die Meldung nennt die fehlende Variable. |

---

## Aufräumen

Der Zwischenstand legt nur `speicher/panel.db` und `.env` an. Beides liegt im
Projektordner; ein `rm -rf Discord-Bot-2.0` entfernt alles restlos.
