-- Bildvorlagen: die Einstellungen, aus denen der Renderer ein Bild baut.
--
-- Die Einstellungen liegen als JSON in einer Spalte und nicht in vielen
-- einzelnen. Sie sind die Form des Renderers und wachsen mit ihm: Jede neue
-- Zeichenoption wäre sonst eine Migration. Abgefragt wird ohnehin nie eine
-- einzelne Einstellung — eine Vorlage wird immer ganz gelesen und ganz
-- geschrieben.
--
-- Der Name steht als eigene Spalte daneben, weil danach sortiert und gesucht
-- wird.

CREATE TABLE bildvorlagen (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  daten        TEXT NOT NULL,
  erstellt_am  TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);

CREATE INDEX bildvorlagen_gilde ON bildvorlagen (guild_id, name COLLATE NOCASE);
