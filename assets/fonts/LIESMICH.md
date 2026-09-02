# Mitgelieferte Schrift

**Liberation Sans** (Regular und Bold), lizenziert unter der SIL Open Font
License 1.1 — der vollständige Lizenztext steht in `LiberationSans-LIZENZ.txt`.

## Warum überhaupt eine Schrift im Repository

Die Bildvorlagen werden auf dem Server gerendert. Auf einer frisch aufgesetzten
Oracle-VM sind oft **gar keine** Schriften installiert; ohne eine mitgelieferte
sähe jedes erzeugte Bild dort anders aus als in der Vorschau — oder bestünde
aus leeren Kästchen.

Registriert wird sie unter dem Namen `Panel Sans`. Der Schriftstapel im
Renderer lautet `"Panel Sans", "DejaVu Sans", sans-serif`: Wo ein System
weitere Schriften hat, füllen sie Zeichen, die Liberation Sans nicht abdeckt
(etwa CJK oder Emoji).
