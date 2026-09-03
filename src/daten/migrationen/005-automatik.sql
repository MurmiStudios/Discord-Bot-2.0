-- Automatiken: Nachrichten, die der Bot von selbst verschickt.
--
-- Von der Willkommensnachricht gibt es genau eine je Server — deshalb ist die
-- Gilden-ID hier der Primärschlüssel und nicht nur ein Verweis. Eine zweite
-- anzulegen ist damit nicht möglich, statt bloss unerwünscht.
--
-- `aktiv` steht als eigene Spalte neben dem Inhalt. Ausschalten soll nichts
-- löschen: Wer eine Willkommensnachricht für den Sommer schreibt und im Herbst
-- abschaltet, will sie im nächsten Sommer wiederhaben.

CREATE TABLE willkommen (
  guild_id     TEXT PRIMARY KEY REFERENCES gilden(guild_id) ON DELETE CASCADE,
  aktiv        INTEGER NOT NULL DEFAULT 0,
  daten        TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
);
