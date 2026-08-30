/**
 * Cookies aus dem Anfragekopf lesen.
 *
 * Bewusst von Hand statt mit einem Paket: Es sind zwoelf Zeilen, und jede
 * zusaetzliche Laufzeit-Abhaengigkeit muesste auf dem Zielserver mitinstalliert
 * werden. Geschrieben werden Cookies mit `res.cookie` aus Express.
 */
export function liesCookies(req) {
  const kopf = req.headers.cookie;
  if (!kopf) return {};

  const aus = {};
  for (const teil of kopf.split(';')) {
    const trenner = teil.indexOf('=');
    if (trenner < 0) continue;
    const name = teil.slice(0, trenner).trim();
    if (name === '') continue;
    try {
      aus[name] = decodeURIComponent(teil.slice(trenner + 1).trim());
    } catch {
      // Ein unlesbarer Wert ist kein Grund, die ganze Anfrage scheitern zu lassen.
      aus[name] = teil.slice(trenner + 1).trim();
    }
  }
  return aus;
}
