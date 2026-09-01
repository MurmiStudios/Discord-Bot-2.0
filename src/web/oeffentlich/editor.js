/* Verbesserungen für den Nachrichteneditor.
 *
 * Ohne diese Datei funktioniert der Editor vollständig: Der Zähler zeigt die
 * Länge beim Laden, und die Platzhalter-Knöpfe hängen ihren Platzhalter über
 * einen normalen Formularabsender ans Textende. Hier kommt nur dazu, was das
 * Tippen angenehmer macht — der Zähler zählt mit, und der Platzhalter landet
 * an der Schreibmarke statt am Ende.
 */
(function () {
  'use strict';

  const zaehler = document.querySelectorAll('[data-zaehler-fuer]');

  for (const anzeige of zaehler) {
    const feld = document.getElementById(anzeige.getAttribute('data-zaehler-fuer'));
    if (!feld) continue;

    const grenze = Number(anzeige.getAttribute('data-grenze')) || 0;

    const aktualisiere = () => {
      const laenge = feld.value.length;
      anzeige.textContent = `${laenge} / ${grenze}`;
      // Zu lang ist nicht nur eine andere Farbe: Das Wort steht daneben.
      anzeige.classList.toggle('zaehler-zuviel', grenze > 0 && laenge > grenze);
      anzeige.setAttribute('aria-live', 'polite');
    };

    feld.addEventListener('input', aktualisiere);
    aktualisiere();
  }

  // Embed-Zähler: Discord rechnet alle Teile gegen ein gemeinsames Limit,
  // also zählt hier auch alles zusammen — genau wie die Prüfung auf dem Server.
  const embedZaehler = document.querySelector('[data-embed-zaehler]');
  if (embedZaehler) {
    const teile = document.querySelectorAll('[data-embed-teil]');
    const grenze = Number(embedZaehler.getAttribute('data-grenze')) || 0;

    const zaehleEmbed = () => {
      let summe = 0;
      for (const teil of teile) summe += teil.value.length;
      embedZaehler.textContent = `${summe} / ${grenze}`;
      embedZaehler.classList.toggle('zaehler-zuviel', summe > grenze);
    };

    for (const teil of teile) teil.addEventListener('input', zaehleEmbed);
    zaehleEmbed();
  }

  const textfeld = document.getElementById('text');
  if (!textfeld) return;

  for (const knopf of document.querySelectorAll('.platzhalter-knopf')) {
    knopf.addEventListener('click', (ereignis) => {
      ereignis.preventDefault();

      const platzhalter = knopf.value;
      const start = textfeld.selectionStart ?? textfeld.value.length;
      const ende = textfeld.selectionEnd ?? textfeld.value.length;

      textfeld.value = textfeld.value.slice(0, start) + platzhalter + textfeld.value.slice(ende);

      // Schreibmarke hinter den eingefügten Platzhalter setzen, damit man
      // einfach weitertippen kann.
      const neu = start + platzhalter.length;
      textfeld.focus();
      textfeld.setSelectionRange(neu, neu);
      textfeld.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
})();
