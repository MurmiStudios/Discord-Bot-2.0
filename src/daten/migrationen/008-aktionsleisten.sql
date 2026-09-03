-- Aktionsleisten: die Knöpfe unter einer Nachricht.
--
-- Die Knöpfe samt ihren Aktionen liegen als JSON in einer Spalte. Eine Leiste
-- wird immer ganz gelesen und ganz geschrieben, und die Aktionen wachsen in den
-- nächsten Schritten noch — als Tabellen bräuchte jede neue Aktionsart eine
-- Migration.

CREATE TABLE aktionsleisten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  daten        TEXT NOT NULL,
  erstellt_am  TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);

CREATE INDEX aktionsleisten_gilde ON aktionsleisten (guild_id, name COLLATE NOCASE);
