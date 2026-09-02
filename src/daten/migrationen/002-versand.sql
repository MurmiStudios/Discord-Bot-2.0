-- Versandvorgänge und ihre einzelnen Ziele.
--
-- Der Fortschritt liegt in der Datenbank und nicht im Prozessspeicher: Nur so
-- kann die Seite ihn beim Neuladen zeigen, und nur so weiß ein Neustart, wie
-- weit ein abgebrochener Versand gekommen war.

CREATE TABLE versandvorgaenge (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id       TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  art            TEXT NOT NULL,
  zustand        TEXT NOT NULL,
  begonnen_am    TEXT NOT NULL,
  beendet_am     TEXT,
  gesamt         INTEGER NOT NULL,
  erledigt       INTEGER NOT NULL DEFAULT 0,
  zugestellt     INTEGER NOT NULL DEFAULT 0,
  fehlgeschlagen INTEGER NOT NULL DEFAULT 0,
  akteur_id      TEXT,
  akteur_name    TEXT,
  betreff        TEXT
);

CREATE INDEX versandvorgaenge_zeit ON versandvorgaenge (guild_id, id DESC);

CREATE TABLE versandziele (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vorgang_id      INTEGER NOT NULL REFERENCES versandvorgaenge(id) ON DELETE CASCADE,
  guild_id        TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  empfaenger_id   TEXT NOT NULL,
  empfaenger_name TEXT,
  zustand         TEXT NOT NULL,
  grund           TEXT,
  zeit            TEXT
);

CREATE INDEX versandziele_vorgang ON versandziele (vorgang_id, id);
