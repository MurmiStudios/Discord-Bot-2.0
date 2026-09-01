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

  // Bewusst kein vorzeitiges return: Weitere Seiten benutzen denselben Editor,
  // und eine davon koennte eine Vorschau ohne Textfeld haben.
  const textfeld = document.getElementById('text');

  for (const knopf of textfeld ? document.querySelectorAll('.platzhalter-knopf') : []) {
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

  // ── Live-Vorschau ──────────────────────────────────────────────────
  //
  // Geholt wird sie vom Server, nicht im Browser nachgebaut: Sonst zeigte die
  // Vorschau irgendwann etwas anderes als das, was wirklich rausgeht.
  const vorschau = document.getElementById('vorschau');
  const formular = document.querySelector('form.editor');

  if (vorschau && formular) {
    // Der Knopf zum Nachladen wird ueberfluessig, sobald das hier laeuft.
    document.documentElement.classList.add('js-an');

    let warten = null;
    let laufend = false;

    const holeVorschau = async () => {
      if (laufend) return;
      laufend = true;
      try {
        const antwort = await fetch('/nachricht/vorschau', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(formular)).toString(),
        });
        if (antwort.ok) vorschau.innerHTML = await antwort.text();
      } catch {
        // Kein Netz, keine Vorschau — die Seite bleibt trotzdem bedienbar.
      } finally {
        laufend = false;
      }
    };

    // Nicht bei jedem Tastendruck: 300 ms nach der letzten Eingabe reicht und
    // haelt uns weit unter der Grenze von 60 Anfragen je Minute.
    formular.addEventListener('input', () => {
      clearTimeout(warten);
      warten = setTimeout(holeVorschau, 300);
    });
  }
})();
