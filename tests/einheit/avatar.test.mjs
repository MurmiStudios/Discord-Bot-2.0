import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erstelleAvatarQuelle } from '../../src/bilder/avatar.mjs';

const ECHT = 'https://cdn.discordapp.com/avatars/1/abc.png?size=256';

function antwortMit(puffer, ok = true) {
  return { ok, arrayBuffer: async () => puffer };
}

test('nur Discords eigener Bildserver wird abgerufen', async () => {
  // Die Adresse stammt aus dem Guild-Cache und ist damit vertrauenswürdig.
  // Die Prüfung kostet trotzdem nur eine Zeile — und nimmt dem Panel die
  // Möglichkeit, je als Umweg für fremde Abrufe zu dienen.
  const gerufen = [];
  const quelle = erstelleAvatarQuelle({
    hole: async (adresse) => {
      gerufen.push(adresse);
      return antwortMit(Buffer.from([1, 2, 3]));
    },
  });

  for (const boese of [
    'http://cdn.discordapp.com/avatars/1/a.png',
    'https://cdn.discordapp.com.beispiel.test/a.png',
    'https://beispiel.test/a.png',
    'https://169.254.169.254/latest/meta-data/',
    'file:///etc/passwd',
    'nicht mal eine Adresse',
    '',
    null,
  ]) {
    assert.equal(await quelle.fuer(boese), null, `durchgelassen: ${boese}`);
  }

  assert.deepEqual(gerufen, [], 'Es wurde trotzdem abgerufen');
});

test('ein Bild von Discord kommt als Puffer zurück', async () => {
  const quelle = erstelleAvatarQuelle({ hole: async () => antwortMit(Buffer.from([9, 9, 9])) });
  const puffer = await quelle.fuer(ECHT);

  assert.ok(Buffer.isBuffer(puffer));
  assert.deepEqual([...puffer], [9, 9, 9]);
});

test('dieselbe Adresse wird nicht zweimal geholt', async () => {
  // Die Vorschau rendert beim Tippen mehrmals je Sekunde. Ohne Merkzettel
  // ginge für jedes Zwischenbild eine Anfrage an Discord.
  let abrufe = 0;
  const quelle = erstelleAvatarQuelle({
    hole: async () => {
      abrufe += 1;
      return antwortMit(Buffer.from([1]));
    },
  });

  await quelle.fuer(ECHT);
  await quelle.fuer(ECHT);
  await quelle.fuer(ECHT);

  assert.equal(abrufe, 1);
});

test('nach der Haltbarkeit wird neu geholt', async () => {
  let abrufe = 0;
  let zeit = 0;
  const quelle = erstelleAvatarQuelle({
    hole: async () => {
      abrufe += 1;
      return antwortMit(Buffer.from([1]));
    },
    jetzt: () => zeit,
  });

  await quelle.fuer(ECHT);
  zeit = 6 * 60 * 1000;
  await quelle.fuer(ECHT);

  assert.equal(abrufe, 2);
});

test('eine abgelehnte, leere oder riesige Antwort ergibt kein Bild', async () => {
  const faelle = [
    ['abgelehnt', antwortMit(Buffer.from([1]), false)],
    ['leer', antwortMit(Buffer.alloc(0))],
    ['riesig', antwortMit(Buffer.alloc(3 * 1024 * 1024))],
  ];

  for (const [name, antwort] of faelle) {
    const quelle = erstelleAvatarQuelle({ hole: async () => antwort });
    assert.equal(await quelle.fuer(ECHT), null, `durchgelassen: ${name}`);
  }
});

test('ein Fehler beim Abruf wirft nicht, sondern gibt null', async () => {
  // Ohne Profilbild ist das Bild unvollständig; ohne Bild wäre die ganze
  // Nachricht weg.
  const quelle = erstelleAvatarQuelle({
    hole: async () => {
      throw new Error('kein Netz');
    },
  });

  assert.equal(await quelle.fuer(ECHT), null);
});
