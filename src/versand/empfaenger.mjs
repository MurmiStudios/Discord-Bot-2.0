/**
 * Aus einer Auswahl von Mitgliedern und Rollen die tatsächlichen Empfänger machen.
 *
 * Drei Dinge, die hier entschieden werden und die man später nicht mehr sieht:
 *
 * - Wer über zwei gewählte Rollen erfasst wird, bekommt trotzdem eine
 *   Nachricht. Sonst schickt ein Versand an „Neu“ und „Alt“ manchen Leuten
 *   dasselbe zweimal.
 * - Bots bekommen keine Direktnachricht. Discord nimmt sie nicht an, und ein
 *   Fehlschlag je Bot in der Ergebnisliste verdeckt die echten Probleme.
 * - Verschwundene Rollen und ausgetretene Mitglieder werden benannt, nicht
 *   stillschweigend übergangen — sonst wundert man sich über die Zahl.
 */

const ARTEN = new Set(['mitglied', 'rolle']);

/** Formularwert `rolle:12345` → `{ art: 'rolle', id: '12345' }`. */
export function parseAuswahl(werte) {
  const liste = Array.isArray(werte) ? werte : werte === undefined ? [] : [werte];
  const gesehen = new Set();
  const auswahl = [];

  for (const roh of liste) {
    const wert = String(roh ?? '');
    const trenner = wert.indexOf(':');
    if (trenner < 1) continue;

    const art = wert.slice(0, trenner);
    const id = wert.slice(trenner + 1);
    if (!ARTEN.has(art) || id === '') continue;

    const schluessel = `${art}:${id}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    auswahl.push({ art, id });
  }

  return auswahl;
}

export function alsAuswahlWert(eintrag) {
  return `${eintrag.art}:${eintrag.id}`;
}

/**
 * @returns {{empfaenger: {id,name}[], anzahl: number,
 *            verschwunden: {art,id}[], leereRollen: {id,name}[]}}
 */
export function loeseEmpfaengerAuf(ansicht, auswahl, guildId) {
  const mitglieder = new Map(ansicht.sucheMitglieder('', guildId).map((m) => [m.id, m]));
  const rollen = new Map(ansicht.rollen(guildId).map((r) => [r.id, r]));

  const empfaenger = new Map();
  const verschwunden = [];
  const leereRollen = [];

  for (const eintrag of auswahl) {
    if (eintrag.art === 'mitglied') {
      const mitglied = mitglieder.get(eintrag.id);
      if (!mitglied) {
        verschwunden.push(eintrag);
        continue;
      }
      empfaenger.set(mitglied.id, { id: mitglied.id, name: mitglied.name });
      continue;
    }

    const rolle = rollen.get(eintrag.id);
    if (!rolle) {
      verschwunden.push(eintrag);
      continue;
    }

    // sucheMitglieder laesst Bots bereits weg — deshalb steht hier nur die
    // Rollenzugehoerigkeit als Bedingung.
    const ausRolle = [...mitglieder.values()].filter((m) => m.rollenIds.includes(rolle.id));
    if (ausRolle.length === 0) {
      leereRollen.push({ id: rolle.id, name: rolle.name });
      continue;
    }
    for (const mitglied of ausRolle) {
      empfaenger.set(mitglied.id, { id: mitglied.id, name: mitglied.name });
    }
  }

  const liste = [...empfaenger.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { empfaenger: liste, anzahl: liste.length, verschwunden, leereRollen };
}

/**
 * Passt die Empfängerzahl zur eingestellten Grenze?
 *
 * Abgelehnt wird, nicht abgeschnitten. Eine gekürzte Liste wäre die
 * unangenehmste Variante: Der Versand liefe scheinbar durch, und dass die
 * Hälfte fehlt, merkt man erst, wenn jemand nachfragt.
 */
export function pruefeGrenze(aufgeloest, hoechstzahl) {
  const anzahl = aufgeloest?.anzahl ?? 0;

  if (anzahl === 0) {
    return {
      ok: false,
      meldung: 'Es ist niemand ausgewählt — es gibt nichts zu senden.',
    };
  }

  if (anzahl > hoechstzahl) {
    return {
      ok: false,
      meldung:
        `${anzahl} Empfänger sind mehr als die erlaubten ${hoechstzahl}. ` +
        'Nimm Empfänger heraus, oder erhöhe DM_MAX_RECIPIENTS in der .env — ' +
        'bedenke dabei, dass Discord bei zu vielen Direktnachrichten in kurzer Zeit bremst.',
    };
  }

  return { ok: true, meldung: null };
}
