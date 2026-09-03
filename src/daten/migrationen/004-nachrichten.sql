-- Gespeicherte Nachrichten: die Vorlagen für alles, was öfter verschickt wird.
--
-- Der Inhalt liegt als JSON in einer Spalte, aus demselben Grund wie bei den
-- Bildvorlagen: Er ist die Form des Nachrichtenmodells und wächst mit ihm.
-- Aktionsleisten kommen in Phase 8 dazu und brauchen dann keine Migration.
--
-- `art` steht dagegen als eigene Spalte da, weil danach gefiltert und gezählt
-- wird — und ein Filter, der jede Zeile erst entpacken muss, ist keiner.

CREATE TABLE nachrichten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  art          TEXT NOT NULL,
  notiz        TEXT,
  daten        TEXT NOT NULL,
  erstellt_am  TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);

CREATE INDEX nachrichten_gilde ON nachrichten (guild_id, art, name COLLATE NOCASE);
