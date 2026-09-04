import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';
import { zeilenAufteilung, verschiebe, pruefeLeiste, GRENZE } from '../../src/aktionen/modell.mjs';

/**
 * Aktionsleisten.
 *
 * Der Kern ist die Aufteilung: Discord bricht nach fünf Knöpfen um, und das
 * Panel muss dasselbe zeigen — sonst baut man sechs und merkt erst beim
 * Versand, dass der sechste allein steht.
 */

const SITZUNG_COOKIE = 'panel_sitzung';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId, anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

async function post(basis, pfad, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}${pfad}`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

const holeAntwort = (basis, pfad, cookie) => fetch(`${basis}${pfad}`, { redirect: 'manual', headers: { cookie } });
const hole = async (basis, pfad, cookie) => (await holeAntwort(basis, pfad, cookie)).text();

/** Felder für n Knöpfe, benannt K1…Kn. */
const knoepfe = (anzahl, farbe = 'grau') =>
  Array.from({ length: anzahl }, (_, i) => i).flatMap((i) => [
    ['beschriftung', `K${i + 1}`], ['emoji', ''], ['farbe', farbe],
  ]);

test('sechs Knöpfe teilen sich in 5 + 1', () => {
  const sechs = Array.from({ length: 6 }, (_, i) => ({ beschriftung: `K${i}` }));
  assert.deepEqual(zeilenAufteilung(sechs).map((r) => r.length), [5, 1]);
  assert.deepEqual(zeilenAufteilung([]).length, 0);
  assert.deepEqual(zeilenAufteilung(sechs.slice(0, 5)).map((r) => r.length), [5]);
});

test('verschieben tauscht Nachbarn und läuft an den Rändern ins Leere', () => {
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(verschiebe(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
});

test('die Prüfung nennt leere Knöpfe, statt sie wegzuwerfen', () => {
  const geprueft = pruefeLeiste({ name: 'Test', knoepfe: [{ beschriftung: '', emoji: '' }] });

  assert.equal(geprueft.ok, false);
  assert.match(geprueft.fehler[0].meldung, /weder Beschriftung noch Emoji/);
});

test('ein Knopf nur mit Emoji ist gültig', () => {
  assert.equal(pruefeLeiste({ name: 'Test', knoepfe: [{ beschriftung: '', emoji: '🎉' }] }).ok, true);
});

test('die Vorschau zeigt bei sechs Knöpfen zwei Reihen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/aktionsleisten', cookie, [
        ['_csrf', csrfToken], ['name', 'Sechs'], ...knoepfe(6), ['knopfHinzufuegen', 'ja'],
      ])
    ).text();

    // Zwei Reihen, und die Marke sagt es auch in Worten.
    assert.equal((text.match(/class="knopfreihe"/g) ?? []).length, 2);
    assert.match(text, /Reihe 1/);
    assert.match(text, /Reihe 2/);
    // Der sechste Knopf trägt den Hinweis an seinem Kasten.
    assert.match(text, /Knopf 6 — hier beginnt Reihe 2/);
  });
});

test('bei fünf Knöpfen gibt es nur eine Reihe und keine Marken', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/aktionsleisten', cookie, [
        ['_csrf', csrfToken], ['name', 'Fünf'], ...knoepfe(5), ['knopfEntfernen', '99'],
      ])
    ).text();

    assert.equal((text.match(/class="knopfreihe"/g) ?? []).length, 1);
    assert.doesNotMatch(text, /class="reihenmarke"/);
  });
});

test('eine Leiste lässt sich speichern und wieder öffnen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Rollen holen'],
      ['beschriftung', 'Ich bin dabei'], ['emoji', '🎉'], ['farbe', 'gruen'],
      ['beschriftung', 'Lieber nicht'], ['emoji', ''], ['farbe', 'rot'],
      ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 303);

    const [leiste] = u.aktionsleisten.alle(GILDE);
    assert.equal(leiste.name, 'Rollen holen');
    assert.equal(leiste.knoepfe.length, 2);
    assert.deepEqual(leiste.knoepfe[0], {
      kennung: null, beschriftung: 'Ich bin dabei', emoji: '🎉', farbe: 'gruen', aktionen: [],
    });

    const editor = await hole(u.basis, `/aktionsleisten/${leiste.id}`, cookie);
    assert.match(editor, /value="Ich bin dabei"/);
    assert.match(editor, /<option value="gruen" selected>/);
  });
});

test('die Liste zeigt einen Farbpunkt je Knopf', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    u.aktionsleisten.lege(GILDE, {
      name: 'Bunt',
      knoepfe: [
        { beschriftung: 'A', emoji: '', farbe: 'blau', aktionen: [] },
        { beschriftung: 'B', emoji: '', farbe: 'rot', aktionen: [] },
      ],
    });

    const text = await hole(u.basis, '/aktionsleisten', cookie);
    assert.match(text, /farbpunkt farbpunkt-blau/);
    assert.match(text, /farbpunkt farbpunkt-rot/);
    assert.match(text, /2 Knöpfe/);
  });
});

test('die Reihenfolge lässt sich ohne JavaScript ändern', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/aktionsleisten', cookie, [
        ['_csrf', csrfToken], ['name', 'Test'],
        ['beschriftung', 'Erster'], ['emoji', ''], ['farbe', 'grau'],
        ['beschriftung', 'Zweiter'], ['emoji', ''], ['farbe', 'grau'],
        ['hoch', '1'],
      ])
    ).text();

    // Der zweite steht jetzt vorn.
    const ersterIndex = text.indexOf('value="Zweiter"');
    const zweiterIndex = text.indexOf('value="Erster"');
    assert.ok(ersterIndex > 0 && ersterIndex < zweiterIndex, 'Die Reihenfolge hat sich nicht geändert');
  });
});

test('ein leerer Knopf wird beim Speichern benannt, nicht weggeworfen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Test'],
      ['beschriftung', 'Da'], ['emoji', ''], ['farbe', 'grau'],
      ['beschriftung', ''], ['emoji', ''], ['farbe', 'grau'],
      ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Knopf 2 hat weder Beschriftung noch Emoji/);
    assert.equal(u.aktionsleisten.alle(GILDE).length, 0);
  });
});

test('ohne Namen wird nicht gespeichert', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', '  '], ...knoepfe(1), ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Gib der Aktionsleiste einen Namen/);
  });
});

test('mehr als 25 Knöpfe kommen gar nicht erst an', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await post(u.basis, '/aktionsleisten', cookie, [
        ['_csrf', csrfToken], ['name', 'Zu viele'], ...knoepfe(GRENZE.KNOEPFE),
        ['knopfHinzufuegen', 'ja'],
      ])
    ).text();

    assert.match(text, new RegExp(`${GRENZE.KNOEPFE} Knöpfe sind erreicht`));
    assert.doesNotMatch(text, /name="knopfHinzufuegen"/);
  });
});

test('die Vorschau sagt, dass Knöpfe ohne Aktion nichts tun', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    const text = await hole(u.basis, '/aktionsleisten/neu', cookie);

    assert.match(text, /Knöpfe ohne Aktion tun beim Klicken nichts/);
  });
});

test('Löschen fragt zurück', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const id = u.aktionsleisten.lege(GILDE, {
      name: 'Weg damit', knoepfe: [{ beschriftung: 'A', emoji: '', farbe: 'grau', aktionen: [] }],
    });

    assert.match(await hole(u.basis, `/aktionsleisten/${id}/loeschen`, cookie), /Weg damit/);

    const ohne = await post(u.basis, `/aktionsleisten/${id}/loeschen`, cookie, [['_csrf', csrfToken]]);
    assert.equal(ohne.status, 422);
    assert.equal(u.aktionsleisten.alle(GILDE).length, 1);

    const mit = await post(u.basis, `/aktionsleisten/${id}/loeschen`, cookie, [
      ['_csrf', csrfToken], ['bestaetigt', 'ja'],
    ]);
    assert.equal(mit.status, 303);
    assert.equal(u.aktionsleisten.alle(GILDE).length, 0);
  });
});

test('eine Leiste eines anderen Servers lässt sich nicht öffnen', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);
    u.gilden.merke('999999999999999999', 'Fremd');
    const fremd = u.aktionsleisten.lege('999999999999999999', { name: 'Fremd', knoepfe: [] });

    assert.equal((await holeAntwort(u.basis, `/aktionsleisten/${fremd}`, cookie)).status, 404);
  });
});

test('ein Betrachter kommt nicht an die Aktionsleisten', async () => {
  await mitApp(
    async (u) => {
      const { kennung } = u.sitzungen.lege_an(GILDE, { discordUserId: 'm1', anzeigename: 'Anna' });
      const antwort = await fetch(`${u.basis}/aktionsleisten`, {
        headers: { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}` },
      });
      assert.equal(antwort.status, 403);
    },
    { rollen: { m1: ['r-schau'] }, zugriffsregeln: [['r-schau', 'BETRACHTER']] },
  );
});

/** Eine gespeicherte Direktnachricht, die ein Knopf verschicken kann. */
const legeNachricht = (u, name) =>
  u.nachrichtenAblage.lege(GILDE, { name, art: 'dm', daten: { art: 'dm', text: 'Hallo {user}' } });

test('eine Aktion lässt sich ohne JavaScript hinzufügen und wieder entfernen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    legeNachricht(u, 'Serverregeln');

    const mitAktion = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Willkommen'],
      ...knoepfe(1),
      ['neueAktionArt', 'dm'], ['aktionHinzufuegen', '0'],
    ]);
    const seite = await mitAktion.text();

    assert.match(seite, /Direktnachricht senden/);
    assert.match(seite, /Serverregeln/, 'die gespeicherte Nachricht steht zur Auswahl');

    const wiederWeg = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Willkommen'],
      ...knoepfe(1),
      ['aktionKnopf', '0'], ['aktionArt', 'dm'], ['aktionNachricht', ''],
      ['aktionEntfernen', '0:0'],
    ]);

    assert.match(await wiederWeg.text(), /Noch keine Aktion/);
  });
});

test('eine Aktion ohne gewählte Nachricht wird nicht gespeichert', async () => {
  // Ein Knopf, der beim Klicken nichts tut, fiele sonst erst dem Klickenden auf.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    legeNachricht(u, 'Serverregeln');

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Willkommen'],
      ...knoepfe(1),
      ['aktionKnopf', '0'], ['aktionArt', 'dm'], ['aktionNachricht', ''],
      ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /Wähle die Nachricht aus/);
    assert.equal(u.aktionsleisten.alle(GILDE).length, 0);
  });
});

test('die Aktion wird beim Knopf gespeichert und wieder angezeigt', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const nachrichtId = legeNachricht(u, 'Serverregeln');

    await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Willkommen'],
      ...knoepfe(2),
      ['aktionKnopf', '1'], ['aktionArt', 'dm'], ['aktionNachricht', String(nachrichtId)],
      ['sichern', 'ja'],
    ]);

    const [leiste] = u.aktionsleisten.alle(GILDE);
    assert.deepEqual(leiste.knoepfe[0].aktionen, [], 'der erste Knopf bleibt ohne Aktion');
    assert.deepEqual(leiste.knoepfe[1].aktionen, [
      { art: 'dm', nachrichtId: String(nachrichtId) },
    ], 'die Aktion hängt am zweiten Knopf, nicht am ersten');

    const editor = await hole(u.basis, `/aktionsleisten/${leiste.id}`, cookie);
    assert.match(editor, /Direktnachricht senden/);
  });
});

test('ohne gespeicherte Nachricht sagt der Editor, wo eine entsteht', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Willkommen'],
      ...knoepfe(1),
      ['neueAktionArt', 'dm'], ['aktionHinzufuegen', '0'],
    ]);

    const seite = await antwort.text();
    assert.match(seite, /noch keine gespeicherte Nachricht/i);
    assert.match(seite, /href="\/nachrichten"/);
  });
});

const TESTROLLEN = [
  { id: 'r-mitglied', name: 'Mitglied', position: 3 },
  { id: 'r-chef', name: 'Chef', position: 20 },
];

test('eine Rollen-Aktion wird mit Richtung und Rolle gespeichert', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Verifizierung'],
      ...knoepfe(1),
      ['aktionKnopf', '0'], ['aktionArt', 'rolle'], ['aktionNachricht', ''],
      ['aktionRolle', 'r-mitglied'], ['aktionRichtung', 'nehmen'],
      ['sichern', 'ja'],
    ]);

    const [leiste] = u.aktionsleisten.alle(GILDE);
    assert.deepEqual(leiste.knoepfe[0].aktionen, [
      { art: 'rolle', rolleId: 'r-mitglied', richtung: 'nehmen' },
    ], 'ohne nachrichtId — die gehört nicht zu dieser Art');
  }, { discordServer: { rollen: TESTROLLEN } });
});

test('eine Rolle über der Bot-Rolle wird beim Speichern abgelehnt', async () => {
  // Der Knopf würde beim Klicken immer scheitern. Das gehört jetzt gesagt.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Verifizierung'],
      ...knoepfe(1),
      ['aktionKnopf', '0'], ['aktionArt', 'rolle'], ['aktionNachricht', ''],
      ['aktionRolle', 'r-chef'], ['aktionRichtung', 'geben'],
      ['sichern', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /über der Rolle des Bots/);
    assert.equal(u.aktionsleisten.alle(GILDE).length, 0);
  }, { discordServer: { rollen: TESTROLLEN } });
});

test('gesperrte Rollen stehen mit ihrem Grund im Auswahlfeld', async () => {
  // Wer „Chef“ sucht und nicht findet, sucht sonst am falschen Ende.
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Verifizierung'],
      ...knoepfe(1),
      ['neueAktionArt', 'rolle'], ['aktionHinzufuegen', '0'],
    ]);

    const seite = await antwort.text();
    assert.match(seite, /Chef — Steht über der Rolle des Bots/);
    assert.match(seite, /Rolle geben oder nehmen/);
  }, { discordServer: { rollen: TESTROLLEN } });
});

test('eine Kette aus zwei Aktionen bleibt in ihrer Reihenfolge', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);
    const nachrichtId = legeNachricht(u, 'Willkommen');

    await post(u.basis, '/aktionsleisten', cookie, [
      ['_csrf', csrfToken], ['name', 'Verifizierung'],
      ...knoepfe(1),
      ['aktionKnopf', '0'], ['aktionArt', 'rolle'], ['aktionNachricht', ''],
      ['aktionRolle', 'r-mitglied'], ['aktionRichtung', 'geben'],
      ['aktionKnopf', '0'], ['aktionArt', 'dm'], ['aktionNachricht', String(nachrichtId)],
      ['aktionRolle', ''], ['aktionRichtung', 'geben'],
      ['sichern', 'ja'],
    ]);

    const [leiste] = u.aktionsleisten.alle(GILDE);
    assert.deepEqual(leiste.knoepfe[0].aktionen.map((a) => a.art), ['rolle', 'dm'],
      'erst die Rolle, dann die Nachricht — die kann dann {role} nennen');
  }, { discordServer: { rollen: TESTROLLEN } });
});
