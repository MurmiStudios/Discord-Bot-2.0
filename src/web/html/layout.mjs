import { html } from './html.mjs';
import { STUFE, reichtAus } from '../../auth/rechte.mjs';
import { dateiVersion } from '../statisch.mjs';

/**
 * Die Seiten des Panels, in der Reihenfolge der Seitenleiste.
 *
 * Die Stufe steht hier und nicht nur an der Route: Wer eine Seite nicht
 * benutzen darf, soll sie auch nicht in der Navigation sehen. Die Route prüft
 * trotzdem noch einmal — eine ausgeblendete Schaltfläche ist keine Sicherung.
 */
export const NAVIGATION = Object.freeze([
  { pfad: '/', name: 'Übersicht', gruppe: 'Verlauf', stufe: STUFE.BETRACHTER },
  { pfad: '/nachricht', name: 'Nachricht', gruppe: 'Senden', stufe: STUFE.MODERATOR },
  { pfad: '/nachrichten', name: 'Gespeicherte Nachrichten', gruppe: 'Senden', stufe: STUFE.MODERATOR },
  { pfad: '/willkommen', name: 'Willkommen', gruppe: 'Automatisch', stufe: STUFE.MODERATOR },
  { pfad: '/rollen-nachrichten', name: 'Rollen-Nachrichten', gruppe: 'Automatisch', stufe: STUFE.MODERATOR },
  { pfad: '/rollenregeln', name: 'Rollenregeln', gruppe: 'Automatisch', stufe: STUFE.MODERATOR },
  { pfad: '/aktionsleisten', name: 'Aktionsleisten', gruppe: 'Bausteine', stufe: STUFE.MODERATOR },
  { pfad: '/vorlagen', name: 'Bildvorlagen', gruppe: 'Bausteine', stufe: STUFE.MODERATOR },
  { pfad: '/rueckmeldungen', name: 'Rückmeldungen', gruppe: 'Verlauf', stufe: STUFE.BETRACHTER },
  { pfad: '/protokoll', name: 'Protokoll', gruppe: 'Verlauf', stufe: STUFE.BETRACHTER },
  { pfad: '/zugriff', name: 'Zugriff', gruppe: 'Verwaltung', stufe: STUFE.OWNER },
]);

const GRUPPEN = ['Verlauf', 'Senden', 'Automatisch', 'Bausteine', 'Verwaltung'];

/** Der Hash im Verweis sorgt dafuer, dass niemand eine alte Fassung sieht. */
const stylesheet = () => `/panel.css?v=${dateiVersion('panel.css')}`;

function navigation(stufe, pfad) {
  return GRUPPEN.map((gruppe) => {
    const eintraege = NAVIGATION.filter(
      (e) => e.gruppe === gruppe && reichtAus(stufe, e.stufe),
    );
    if (eintraege.length === 0) return '';

    return html`
      <div class="nav-gruppe">
        <p class="nav-titel">${gruppe}</p>
        ${eintraege.map(
          (e) => html`<a href="${e.pfad}"${e.pfad === pfad ? html` aria-current="page"` : ''}>${e.name}</a>`,
        )}
      </div>
    `;
  });
}

function botAnzeige(botStatus) {
  if (botStatus?.verbunden) {
    // Verbunden heisst noch nicht brauchbar: Ohne Mitgliederliste findet die
    // Empfaengersuche niemanden, und das sieht man der Kopfzeile sonst nicht an.
    if (botStatus.mitgliederGrund) {
      return html`
        <span class="bot bot-halb">
          <span class="punkt"></span>Bot verbunden, aber unvollständig
          <span class="bot-grund">${botStatus.mitgliederGrund}</span>
        </span>
      `;
    }
    return html`<span class="bot bot-an"><span class="punkt"></span>Bot verbunden</span>`;
  }
  return html`
    <span class="bot bot-aus">
      <span class="punkt"></span>Bot nicht verbunden
      <span class="bot-grund">${botStatus?.grund ?? 'Grund unbekannt.'}</span>
    </span>
  `;
}

/**
 * Rahmen jeder Panel-Seite.
 *
 * Kein Inline-Style und kein Inline-Skript: Die Content-Security-Policy
 * verbietet beides, deshalb liegen Stylesheet und Skripte als eigene Dateien
 * daneben.
 */
export function seite({ titel, pfad, stufe, sitzung, botStatus, inhalt, skripte = [] }) {
  // Die Seitensuche gehoert zu jeder Seite, also laedt jede Seite sie mit.
  // Jedes Skript bekommt seinen Inhaltshash, damit niemand eine alte Fassung sieht.
  const alleSkripte = ['/suche.js', ...skripte].map(
    (pfad) => `${pfad}?v=${dateiVersion(pfad.replace(/^\//, ''))}`,
  );
  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titel} · Discord-Panel</title>
<link rel="stylesheet" href="${stylesheet()}">
</head>
<body>
<a class="sprunglink" href="#inhalt">Zum Inhalt springen</a>
<div class="panel">
  <nav class="seitenleiste" aria-label="Bereiche des Panels">
    <p class="marke">Discord-Panel</p>
    <form class="seitensuche" method="get" action="/suche" role="search">
      <label for="seitensuche-feld">Seite suchen</label>
      <input type="search" id="seitensuche-feld" name="q" placeholder="Seite suchen (/)">
    </form>
    <div class="nav-liste">${navigation(stufe, pfad)}</div>
    <div class="abmelden">
      <form method="post" action="/logout">
        <input type="hidden" name="_csrf" value="${sitzung?.csrfToken ?? ''}">
        <button type="submit" title="Abmelden">Abmelden</button>
      </form>
    </div>
  </nav>
  <div class="hauptbereich">
    <header class="kopfzeile">
      ${botAnzeige(botStatus)}
      <span class="konto">${sitzung?.anzeigename ?? 'Unbekannt'}</span>
    </header>
    <main id="inhalt" tabindex="-1">
      ${inhalt}
    </main>
  </div>
</div>
${alleSkripte.map((quelle) => html`<script src="${quelle}" defer></script>`)}
</body>
</html>
`;
}
