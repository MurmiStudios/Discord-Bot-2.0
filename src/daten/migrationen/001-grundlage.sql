-- Grundtabellen: Gilden, Sitzungen, Zugriffsstufen, Protokoll.
--
-- Jede fachliche Tabelle traegt guild_id und haengt per Fremdschluessel an
-- `gilden`. Das Panel bedient heute einen Server; das Datenmodell kann mehrere,
-- weil ein nachtraeglicher Umbau eine Migration ueber alle Tabellen waere.

CREATE TABLE gilden (
  guild_id        TEXT PRIMARY KEY,
  name            TEXT,
  hinzugefuegt_am TEXT NOT NULL
);

-- Gespeichert wird nur der Hash der Sitzungs-ID: wer die Datei in die Hand
-- bekommt, kann damit keine fremde Sitzung uebernehmen.
CREATE TABLE sitzungen (
  id              TEXT PRIMARY KEY,
  guild_id        TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL,
  anzeigename     TEXT,
  avatar          TEXT,
  csrf_token      TEXT NOT NULL,
  erstellt_am     TEXT NOT NULL,
  gesehen_am      TEXT NOT NULL,
  laeuft_ab_am    TEXT NOT NULL
);

CREATE INDEX sitzungen_ablauf ON sitzungen (laeuft_ab_am);

-- Welche Discord-Rolle welche Stufe im Panel bekommt. Der Owner steht nicht
-- hier drin, sondern in der .env — sonst koennte er sich selbst aussperren.
CREATE TABLE zugriff (
  guild_id  TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  rollen_id TEXT NOT NULL,
  stufe     TEXT NOT NULL,
  PRIMARY KEY (guild_id, rollen_id)
);

-- Vorgangsarten sind Daten, keine fest verdrahteten Faelle: eine spaetere
-- Moderationsfunktion braucht dafuer keine Migration.
CREATE TABLE protokoll (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id    TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  zeit        TEXT NOT NULL,
  art         TEXT NOT NULL,
  gruppe      TEXT NOT NULL,
  ergebnis    TEXT NOT NULL,
  akteur_id   TEXT,
  akteur_name TEXT,
  betreff     TEXT,
  klartext    TEXT,
  daten       TEXT
);

CREATE INDEX protokoll_zeit ON protokoll (guild_id, zeit DESC);
CREATE INDEX protokoll_gruppe ON protokoll (guild_id, gruppe, zeit DESC);
