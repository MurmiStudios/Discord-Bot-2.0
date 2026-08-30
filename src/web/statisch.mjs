import express from 'express';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VERZEICHNIS = new URL('./oeffentlich/', import.meta.url);
// express.static verlangt einen Pfad, keine URL — unter Windows waere ein
// naives Abschneiden des Schemas ausserdem falsch.
const VERZEICHNIS_PFAD = fileURLToPath(VERZEICHNIS);
const versionen = new Map();

/**
 * Kurzer Inhaltshash einer statischen Datei.
 *
 * Er hängt als `?v=` am Verweis. Ändert sich die Datei, ändert sich der Verweis
 * — und der Browser holt sie neu, statt eine alte Fassung aus dem Cache zu
 * zeigen. Berechnet wird er einmal je Datei beim ersten Zugriff.
 */
export function dateiVersion(name) {
  if (!versionen.has(name)) {
    try {
      const inhalt = readFileSync(new URL(name, VERZEICHNIS));
      versionen.set(name, createHash('sha256').update(inhalt).digest('hex').slice(0, 10));
    } catch {
      // Fehlt die Datei, soll die Seite trotzdem ausgeliefert werden.
      versionen.set(name, 'fehlt');
    }
  }
  return versionen.get(name);
}

export function registriereStatisch(app) {
  app.use(
    express.static(VERZEICHNIS_PFAD, {
      // Der Hash im Verweis macht lange Gueltigkeit gefahrlos.
      maxAge: '365d',
      index: false,
      dotfiles: 'deny',
      fallthrough: true,
    }),
  );
}
