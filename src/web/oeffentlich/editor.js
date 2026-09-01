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
