/* Sofortsuche über die Seitenleiste.
 *
 * Verbessert das vorhandene Formular, ersetzt es nicht: Ohne diese Datei führt
 * ein Absenden weiterhin auf /suche. Gefiltert werden dieselben Verweise, die
 * ohnehin schon in der Seitenleiste stehen — es gibt keine zweite Liste, die
 * mit der ersten auseinanderlaufen könnte.
 */
(function () {
  'use strict';

  const feld = document.getElementById('seitensuche-feld');
  if (!feld) return;

  const leiste = feld.closest('.seitenleiste');
  if (!leiste) return;

  const verweise = () => Array.from(leiste.querySelectorAll('.nav-gruppe a'));
  const sichtbare = () => verweise().filter((a) => !a.hidden);

  let gewaehlt = -1;

  function markiere(index) {
    const liste = sichtbare();
    liste.forEach((a, i) => a.classList.toggle('treffer-gewaehlt', i === index));
    gewaehlt = index;
    if (liste[index]) liste[index].scrollIntoView({ block: 'nearest' });
  }

  function filtere() {
    const gesucht = feld.value.trim().toLowerCase();

    for (const a of verweise()) {
      a.hidden = gesucht !== '' && !a.textContent.toLowerCase().includes(gesucht);
    }
    // Gruppen ohne sichtbaren Eintrag verschwinden mit.
    for (const gruppe of leiste.querySelectorAll('.nav-gruppe')) {
      gruppe.hidden = gruppe.querySelectorAll('a:not([hidden])').length === 0;
    }

    markiere(gesucht === '' ? -1 : 0);
  }

  feld.addEventListener('input', filtere);

  feld.addEventListener('keydown', (ereignis) => {
    const liste = sichtbare();

    if (ereignis.key === 'ArrowDown') {
      ereignis.preventDefault();
      markiere(Math.min(gewaehlt + 1, liste.length - 1));
    } else if (ereignis.key === 'ArrowUp') {
      ereignis.preventDefault();
      markiere(Math.max(gewaehlt - 1, 0));
    } else if (ereignis.key === 'Enter' && liste[gewaehlt]) {
      // Nur wenn wirklich etwas gewählt ist — sonst darf das Formular absenden
      // und die Suche läuft wie ohne JavaScript über /suche.
      ereignis.preventDefault();
      window.location.href = liste[gewaehlt].getAttribute('href');
    } else if (ereignis.key === 'Escape') {
      feld.value = '';
      filtere();
      feld.blur();
    }
  });

  document.addEventListener('keydown', (ereignis) => {
    if (ereignis.key !== '/' || ereignis.metaKey || ereignis.ctrlKey || ereignis.altKey) return;

    const ziel = ereignis.target;
    const tippbar =
      ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable);
    if (tippbar) return;

    ereignis.preventDefault();
    feld.focus();
    feld.select();
  });
})();
