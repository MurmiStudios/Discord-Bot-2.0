import { rateLimit } from 'express-rate-limit';

/**
 * Content-Security-Policy, vollstaendig ausgeschrieben.
 *
 * Vollstaendig heisst: Jede Richtlinie steht da, auch die, die aus `default-src`
 * folgen wuerden. Eine geerbte Richtlinie sieht man beim Lesen nicht — und
 * genau die uebersieht man dann beim Aendern.
 *
 * Kein 'unsafe-inline': Deshalb liegen Stylesheet und Skripte als eigene
 * Dateien vor, statt im HTML zu stehen.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: https://cdn.discordapp.com",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

const HSTS = 'max-age=15552000; includeSubDomains';

export function sicherheitsKoepfe({ sicheresCookie }) {
  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // Nur ueber HTTPS. Ueber HTTP gesetzt, wuerde HSTS den Browser dauerhaft
    // auf https zwingen — und das Panel damit unerreichbar machen.
    if (sicheresCookie) res.setHeader('Strict-Transport-Security', HSTS);

    next();
  };
}

function zuVieleAntwort(_req, res) {
  res
    .status(429)
    .type('html')
    .send(
      '<!doctype html>\n<html lang="de">\n<head><meta charset="utf-8">' +
        '<title>Zu viele Anfragen · Discord-Panel</title></head>\n<body>\n' +
        '<h1>Zu viele Anfragen</h1>\n' +
        '<p>Von dieser Adresse kamen in kurzer Zeit zu viele Anfragen. Warte bitte\n' +
        'einen Moment und versuche es später noch einmal.</p>\n' +
        '</body>\n</html>\n',
    );
}

const GEMEINSAM = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: zuVieleAntwort,
};

/** 300 Anfragen je 15 Minuten — mehr blaettert niemand von Hand. */
export function allgemeineGrenze() {
  return rateLimit({ ...GEMEINSAM, windowMs: 15 * 60 * 1000, limit: 300 });
}

/**
 * 20 Anmeldeversuche je 15 Minuten. Getrennt von der allgemeinen Grenze, damit
 * ein Ansturm auf die Anmeldung nicht das übrige Panel mit ausbremst.
 */
export function anmeldeGrenze() {
  return rateLimit({ ...GEMEINSAM, windowMs: 15 * 60 * 1000, limit: 20 });
}

/**
 * 10 Versandvorgänge je Minute. Ein Massenversand ist nichts, was jemand
 * zehnmal in der Minute auslöst — wohl aber etwas, das ein durchgegangenes
 * Skript teuer machen könnte.
 */
export function versandGrenze() {
  return rateLimit({ ...GEMEINSAM, windowMs: 60 * 1000, limit: 10 });
}

/**
 * 60 Vorschau-Anfragen je Minute. Die Vorschau wird beim Tippen abgerufen —
 * grosszuegig genug fuer fluessiges Schreiben, eng genug, dass sie sich nicht
 * als Lastwerkzeug missbrauchen laesst.
 */
export function vorschauGrenze() {
  return rateLimit({ ...GEMEINSAM, windowMs: 60 * 1000, limit: 60 });
}
