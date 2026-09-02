/* Lebende Vorschau für den Bildvorlagen-Editor.
 *
 * Ohne diese Datei ist die Seite vollständig bedienbar: Die Vorschau steckt
 * schon beim Ausliefern als Bild im Formular, und der Knopf „Vorschau
 * aktualisieren" holt eine neue. Hier kommt nur dazu, dass sie beim Tippen
 * nachzieht.
 *
 * Das Bild wird als data:-Adresse gesetzt und nicht über URL.createObjectURL:
 * Die Content-Security-Policy erlaubt `img-src 'self' data:`, aber kein
 * `blob:` — und die Regel wird nicht für eine Bequemlichkeit gelockert.
 */
(function () {
  'use strict';

  const bild = document.getElementById('vorlagenvorschau');
  const formular = document.querySelector('form.vorlageneditor');
  if (!bild || !formular) return;

  // Der Knopf zum Nachladen wird überflüssig, sobald das hier läuft.
  document.documentElement.classList.add('js-an');

  let warten = null;
  let laufend = false;
  let nochmal = false;

  const alsDatenAdresse = (blob) =>
    new Promise((fertig, fehler) => {
      const leser = new FileReader();
      leser.onload = () => fertig(leser.result);
      leser.onerror = () => fehler(leser.error);
      leser.readAsDataURL(blob);
    });

  const holeVorschau = async () => {
    if (laufend) {
      nochmal = true;
      return;
    }
    laufend = true;

    try {
      const felder = new FormData(formular);
      // Die ausgewählte Datei bleibt draussen: Sie soll erst beim Absenden
      // hochgeladen werden, nicht bei jedem Tastendruck.
      felder.delete('hintergrund');

      const antwort = await fetch('/vorlagen/vorschau.png', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(felder).toString(),
      });

      if (antwort.ok) bild.src = await alsDatenAdresse(await antwort.blob());
    } catch {
      // Kein Netz, keine neue Vorschau — die alte bleibt stehen, und das
      // Formular funktioniert weiter.
    } finally {
      laufend = false;
      if (nochmal) {
        nochmal = false;
        holeVorschau();
      }
    }
  };

  const anstossen = () => {
    clearTimeout(warten);
    // Ein Bild zu zeichnen kostet mehr als ein Stück HTML — deshalb wird
    // länger gewartet als im Nachrichteneditor.
    warten = setTimeout(holeVorschau, 500);
  };

  formular.addEventListener('input', anstossen);
  formular.addEventListener('change', anstossen);
})();
