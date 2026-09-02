/* Hält die Fortschrittsseite aktuell, solange ein Versand läuft.
 *
 * Ohne diese Datei zeigt die Seite den Stand vom Zeitpunkt des Aufrufs und
 * bietet einen Knopf zum Nachladen — der Server liefert bei jedem Aufruf den
 * gespeicherten Stand. Hier kommt nur dazu, dass das Nachladen von selbst
 * passiert.
 */
(function () {
  'use strict';

  const bereich = document.querySelector('.fortschritt');
  if (!bereich || bereich.getAttribute('data-laeuft') !== 'ja') return;

  document.documentElement.classList.add('js-an');

  const inhalt = document.getElementById('inhalt');
  if (!inhalt) return;

  let laeuft = true;

  async function hole() {
    if (!laeuft) return;

    try {
      const antwort = await fetch(window.location.href, { headers: { accept: 'text/html' } });
      if (!antwort.ok) return;

      const geladen = new DOMParser().parseFromString(await antwort.text(), 'text/html');
      const neu = geladen.getElementById('inhalt');
      if (!neu) return;

      inhalt.innerHTML = neu.innerHTML;

      // Sobald der Versand fertig ist, hört das Nachladen auf. Eine Seite, die
      // ewig weiterfragt, ist eine Last ohne Nutzen.
      const stand = inhalt.querySelector('.fortschritt');
      if (!stand || stand.getAttribute('data-laeuft') !== 'ja') laeuft = false;
    } catch {
      // Kein Netz: beim nächsten Versuch vielleicht wieder. Die Seite bleibt
      // stehen, statt eine Fehlermeldung über den Stand zu legen.
    }
  }

  const takt = setInterval(() => {
    if (!laeuft) {
      clearInterval(takt);
      return;
    }
    hole();
  }, 1500);
})();
