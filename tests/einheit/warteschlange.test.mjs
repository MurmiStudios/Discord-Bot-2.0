import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { oeffneDatenbank } from '../../src/daten/db.mjs';
import { migriere, ladeMigrationen } from '../../src/daten/migrieren.mjs';
import { erstelleGilden } from '../../src/daten/gilden.mjs';
import { erstelleVersandAblage } from '../../src/daten/versand.mjs';
import { erstelleWarteschlange } from '../../src/versand/warteschlange.mjs';
import { erstelleProtokoll } from '../../src/protokoll/protokoll.mjs';
import { erstelleLogger } from '../../src/kern/logger.mjs';
import { mitTempVerzeichnis } from '../hilfen/db.mjs';

const GILDE = '111111111111111111';
const FREMD = '222222222222222222';
const AKTEUR = { id: '4242', name: 'Owner' };

const EMPFAENGER = [
  { id: 'm1', name: 'Anna' },
  { id: 'm2', name: 'Bert' },
  { id: 'm3', name: 'Clara' },
];

function discordFehler(code, meldung = 'abgelehnt') {
  return Object.assign(new Error(meldung), { code });
}

/**
 * Warteschlange mit erfundenem Versand und ohne echtes Warten.
 * `senden` bekommt den Empfänger und darf werfen.
 */
async function mitWarteschlange(fn, { senden = async () => {} } = {}) {
  return mitTempVerzeichnis(async (dir) => {
    const db = oeffneDatenbank(join(dir, 'panel.db'));
    migriere(db, ladeMigrationen(new URL('../../src/daten/migrationen/', import.meta.url).pathname));
    const gilden = erstelleGilden(db);
    gilden.merke(GILDE, 'Testserver');
    gilden.merke(FREMD, 'Fremder');

    const pausen = [];
    const ablage = erstelleVersandAblage(db);
    const warteschlange = erstelleWarteschlange({
      ablage,
      senden,
      protokoll: erstelleProtokoll(db),
      logger: erstelleLogger({ schreibe: () => {} }),
      konfig: { dmPauseMs: 1200 },
      warte: async (ms) => { pausen.push(ms); },
    });

    try {
      return await fn({ db, ablage, warteschlange, pausen });
    } finally {
      db.close();
    }
  });
}

test('alle Empfänger werden zugestellt und der Vorgang gilt als fertig', async () => {
  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, {
      empfaenger: EMPFAENGER, akteur: AKTEUR, betreff: 'Test',
    });
    await fertig;

    const stand = ablage.status(GILDE, vorgangId);
    assert.equal(stand.zustand, 'fertig');
    assert.equal(stand.gesamt, 3);
    assert.equal(stand.zugestellt, 3);
    assert.equal(stand.fehlgeschlagen, 0);
  });
});

test('jeder Empfänger wird einzeln festgehalten', async () => {
  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    const ziele = ablage.ziele(GILDE, vorgangId);
    assert.deepEqual(ziele.map((z) => z.empfaengerName).sort(), ['Anna', 'Bert', 'Clara']);
    assert.ok(ziele.every((z) => z.zustand === 'zugestellt'));
  });
});

test('ein Fehlschlag stoppt den Versand nicht, sondern wird beim Empfänger vermerkt', async () => {
  const senden = async (empfaenger) => {
    if (empfaenger.id === 'm2') throw discordFehler(50007);
  };

  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    const stand = ablage.status(GILDE, vorgangId);
    assert.equal(stand.zugestellt, 2);
    assert.equal(stand.fehlgeschlagen, 1);

    const bert = ablage.ziele(GILDE, vorgangId).find((z) => z.empfaengerId === 'm2');
    assert.equal(bert.zustand, 'fehlgeschlagen');
    assert.match(bert.grund, /Direktnachricht/i, 'Der Grund steht nicht im Klartext da');
    assert.ok(!bert.grund.includes('50007'), 'Der Zahlencode steht im Grund');
  }, { senden });
});

test('zwischen zwei Direktnachrichten wird die eingestellte Pause eingelegt', async () => {
  await mitWarteschlange(async ({ warteschlange, pausen }) => {
    const { fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    // Zwei Pausen bei drei Empfängern — vor dem ersten wird nicht gewartet.
    assert.deepEqual(pausen, [1200, 1200]);
  });
});

test('eine Bremse von Discord lässt den Versand pausieren statt scheitern', async () => {
  let versuche = 0;
  const senden = async (empfaenger) => {
    if (empfaenger.id === 'm1') {
      versuche += 1;
      if (versuche === 1) throw discordFehler(40003);
    }
  };

  await mitWarteschlange(async ({ ablage, warteschlange, pausen }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    assert.equal(ablage.status(GILDE, vorgangId).zugestellt, 3, 'Der gebremste Versand kam nicht durch');
    assert.ok(pausen.some((p) => p > 1200), 'Es wurde keine längere Pause eingelegt');
  }, { senden });
});

test('eine Bremse, die nicht aufhört, wird irgendwann als Fehlschlag vermerkt', async () => {
  const senden = async (empfaenger) => {
    if (empfaenger.id === 'm1') throw discordFehler(40003);
  };

  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    const stand = ablage.status(GILDE, vorgangId);
    assert.equal(stand.fehlgeschlagen, 1);
    assert.equal(stand.zugestellt, 2, 'Die übrigen Empfänger wurden übersprungen');
  }, { senden });
});

test('der Fortschritt lässt sich schon während des Versands ablesen', async () => {
  const stände = [];
  let ablageAussen;
  let vorgangAussen;

  const senden = async () => {
    if (ablageAussen && vorgangAussen) {
      stände.push(ablageAussen.status(GILDE, vorgangAussen).erledigt);
    }
  };

  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    ablageAussen = ablage;
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    vorgangAussen = vorgangId;
    await fertig;

    assert.deepEqual(stände, [0, 1, 2], 'Der Fortschritt wurde nicht laufend fortgeschrieben');
  }, { senden });
});

test('ein Neustart markiert einen laufenden Vorgang als abgebrochen', async () => {
  await mitWarteschlange(async ({ db, ablage }) => {
    // Ein Vorgang, wie ihn ein abgestürzter Prozess hinterlassen haette.
    const id = ablage.beginne(GILDE, {
      art: 'dm', gesamt: 5, akteur: AKTEUR, betreff: 'Halb gelaufen',
    });
    ablage.merkeErgebnis(GILDE, id, { empfaengerId: 'm1', zugestellt: true });

    const { brichLaufendeAb } = erstelleWarteschlange({
      ablage,
      senden: async () => {},
      protokoll: erstelleProtokoll(db),
      logger: erstelleLogger({ schreibe: () => {} }),
      konfig: { dmPauseMs: 0 },
      warte: async () => {},
    });
    const abgebrochen = brichLaufendeAb(GILDE);

    assert.equal(abgebrochen, 1);
    const stand = ablage.status(GILDE, id);
    assert.equal(stand.zustand, 'abgebrochen');
    assert.equal(stand.erledigt, 1, 'Es steht nicht mehr da, wie weit er kam');
    assert.equal(stand.gesamt, 5);
  });
});

test('ein fertiger Vorgang wird durch den Neustart nicht angefasst', async () => {
  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    warteschlange.brichLaufendeAb(GILDE);

    assert.equal(ablage.status(GILDE, vorgangId).zustand, 'fertig');
  });
});

test('der Versand landet im Protokoll, mit Ergebnis', async () => {
  const senden = async (empfaenger) => {
    if (empfaenger.id === 'm2') throw discordFehler(50007);
  };

  await mitWarteschlange(async ({ db, warteschlange }) => {
    const { fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR, betreff: 'Ankündigung' });
    await fertig;

    const eintraege = erstelleProtokoll(db).lies(GILDE).eintraege;
    assert.ok(eintraege.length >= 1);
    assert.ok(eintraege.some((e) => /versand/i.test(e.art)));
    assert.ok(eintraege.some((e) => e.akteurName === 'Owner'));
  }, { senden });
});

test('ein Vorgang einer Gilde ist für die andere unsichtbar', async () => {
  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    const { vorgangId, fertig } = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR });
    await fertig;

    assert.equal(ablage.status(FREMD, vorgangId), undefined);
    assert.deepEqual(ablage.ziele(FREMD, vorgangId), []);
  });
});

test('der jüngste Vorgang einer Gilde lässt sich abfragen', async () => {
  await mitWarteschlange(async ({ ablage, warteschlange }) => {
    warteschlange.starte(GILDE, { empfaenger: [EMPFAENGER[0]], akteur: AKTEUR, betreff: 'Erster' });
    const zweiter = warteschlange.starte(GILDE, { empfaenger: EMPFAENGER, akteur: AKTEUR, betreff: 'Zweiter' });
    await zweiter.fertig;

    assert.equal(ablage.juengster(GILDE).id, zweiter.vorgangId);
  });
});
