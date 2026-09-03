-- Rollenregeln: „Wer X erhält, verliert Y.“
--
-- Eine Regel je Auslöserrolle — als UNIQUE, aus demselben Grund wie bei den
-- Rollen-Nachrichten. Zwei Regeln für denselben Auslöser wären nicht falsch,
-- aber unübersichtlich: Man müsste beide lesen, um zu wissen, was passiert.
-- Mehrere zu entziehende Rollen stehen deshalb in einer Regel.
--
-- Die zu entziehenden Rollen liegen als JSON-Liste in einer Spalte. Eine eigene
-- Zeilentabelle wäre sauberer normalisiert, brächte hier aber nichts: Gelesen
-- wird immer die ganze Regel, und einzeln abgefragt wird nie.

CREATE TABLE rollenregeln (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  ausloeser    TEXT NOT NULL,
  entzug       TEXT NOT NULL,
  aktiv        INTEGER NOT NULL DEFAULT 0,
  notiz        TEXT,
  geaendert_am TEXT NOT NULL,
  UNIQUE (guild_id, ausloeser)
);
