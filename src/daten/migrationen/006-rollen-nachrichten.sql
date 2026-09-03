-- Eine Nachricht je Rolle.
--
-- „Genau eine" steht als UNIQUE im Schema und nicht als Absprache im Code:
-- Eine zweite anzulegen ist damit unmöglich statt bloss unerwünscht. Das
-- Schreiben geht deshalb über ON CONFLICT — wer speichert, ersetzt.
--
-- Die Rollen-ID ist eine Discord-Kennung und kein Verweis auf eine eigene
-- Tabelle. Rollen leben auf Discord; verschwindet eine, bleibt die Nachricht
-- als verwaiste Zeile stehen und die Seite sagt es. Ein Fremdschlüssel könnte
-- das gar nicht wissen.

CREATE TABLE rollen_nachrichten (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id     TEXT NOT NULL REFERENCES gilden(guild_id) ON DELETE CASCADE,
  rollen_id    TEXT NOT NULL,
  aktiv        INTEGER NOT NULL DEFAULT 0,
  daten        TEXT NOT NULL,
  geaendert_am TEXT NOT NULL,
  UNIQUE (guild_id, rollen_id)
);
