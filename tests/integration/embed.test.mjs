import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitApp, GILDE } from '../hilfen/app.mjs';

const SITZUNG_COOKIE = 'panel_sitzung';

function alsOwner({ sitzungen, konfig }) {
  const { kennung, csrfToken } = sitzungen.lege_an(GILDE, {
    discordUserId: konfig.ownerId,
    anzeigename: 'Owner',
  });
  return { cookie: `${SITZUNG_COOKIE}=${encodeURIComponent(kennung)}`, csrfToken };
}

/** POST mit mehrfach vorkommenden Feldnamen (Embed-Felder). */
async function sende(basis, cookie, paare) {
  const koerper = new URLSearchParams();
  for (const [name, wert] of paare) koerper.append(name, wert);
  return fetch(`${basis}/nachricht`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
  });
}

test('ohne Embed bietet die Seite nur den Knopf an, es einzuschalten', async () => {
  await mitApp(async (u) => {
    const { cookie } = alsOwner(u);

    const text = await (
      await fetch(`${u.basis}/nachricht`, { headers: { cookie } })
    ).text();

    assert.match(text, /name="embedUmschalten"/);
    assert.ok(!text.includes('name="embedTitel"'), 'Der Embed-Editor ist schon offen');
  });
});

test('ein Klick auf den Knopf klappt den Embed-Editor auf', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Hallo'], ['embedUmschalten', 'ja'],
      ])
    ).text();

    for (const feld of ['embedTitel', 'embedBeschreibung', 'embedFusszeile', 'embedAutor', 'embedFarbe']) {
      assert.ok(text.includes(`name="${feld}"`), `${feld} fehlt im Editor`);
    }
  });
});

test('der Embed-Zähler steht am Editor und zeigt die tatsächliche Zahl', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
        ['embedTitel', 'abcde'], ['embedBeschreibung', '1234567890'], ['wechselZu', 'dm'],
      ])
    ).text();

    assert.match(text, /15\s*\/\s*6000/);
  });
});

test('über 6000 Zeichen wird vor dem Senden gemeldet, mit Ist-Zahl und Erklärung', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
      ['embedBeschreibung', 'x'.repeat(4096)], ['embedFusszeile', 'y'.repeat(1905)], ['pruefen', 'ja'],
    ]);
    const text = await antwort.text();

    assert.equal(antwort.status, 422);
    assert.match(text, /6001/);
    assert.match(text, /Feldnamen/, 'Es wird nicht erklärt, was alles mitzählt');
  });
});

test('nach der Ablehnung steht der eingegebene Embed-Inhalt noch da', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
        ['embedTitel', 'Mein Titel'], ['embedBeschreibung', 'x'.repeat(4200)], ['pruefen', 'ja'],
      ])
    ).text();

    assert.match(text, /Mein Titel/);
  });
});

test('ein zu langer Titel wird an seinem eigenen Feld gemeldet', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const antwort = await sende(u.basis, cookie, [
      ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['embedAn', 'ja'],
      ['embedTitel', 'x'.repeat(257)], ['pruefen', 'ja'],
    ]);

    assert.equal(antwort.status, 422);
    assert.match(await antwort.text(), /257 Zeichen/);
  });
});

test('ein Feld lässt sich hinzufügen', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['embedAn', 'ja'], ['feldHinzufuegen', 'ja'],
      ])
    ).text();

    assert.ok(text.includes('name="embedFeldName"'), 'Es wurde kein Feld angelegt');
  });
});

test('genau das gewählte Feld wird entfernt, nicht das letzte', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['embedAn', 'ja'],
        ['embedFeldName', 'eins'], ['embedFeldWert', 'a'],
        ['embedFeldName', 'zwei'], ['embedFeldWert', 'b'],
        ['embedFeldName', 'drei'], ['embedFeldWert', 'c'],
        ['feldEntfernen', '1'],
      ])
    ).text();

    assert.match(text, /value="eins"/);
    assert.ok(!text.includes('value="zwei"'), 'Das gewählte Feld steht noch da');
    assert.match(text, /value="drei"/);
  });
});

test('Embed-Inhalt übersteht den Wechsel des Ziels', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'x'], ['embedAn', 'ja'],
        ['embedTitel', 'Bleibt stehen'], ['wechselZu', 'kanal'],
      ])
    ).text();

    assert.match(text, /Bleibt stehen/);
    assert.ok(text.includes('name="art" value="kanal"'));
  });
});

test('das Ausschalten des Embeds lässt den Text unangetastet', async () => {
  await mitApp(async (u) => {
    const { cookie, csrfToken } = alsOwner(u);

    const text = await (
      await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', 'Mein Text'], ['embedAn', 'ja'],
        ['embedTitel', 'weg gleich'], ['embedUmschalten', 'ja'],
      ])
    ).text();

    assert.match(text, /Mein Text/);
    assert.ok(!text.includes('name="embedTitel"'), 'Der Embed-Editor ist noch offen');
  });
});

test('ein Embed allein reicht als Inhalt — ohne Text', async () => {
  // Mit Empfänger, sonst scheitert die Prüfung an der leeren Empfängerliste
  // statt am Inhalt — und der Test prüfte etwas anderes als sein Name sagt.
  await mitApp(
    async (u) => {
      const { cookie, csrfToken } = alsOwner(u);

      const antwort = await sende(u.basis, cookie, [
        ['_csrf', csrfToken], ['art', 'dm'], ['text', ''], ['embedAn', 'ja'],
        ['embedBeschreibung', 'Nur die Karte'],
        ['empfaenger', 'mitglied:m1'], ['pruefen', 'ja'],
      ]);

      assert.equal(antwort.status, 200);
    },
    { discordServer: { mitglieder: [{ id: 'm1', name: 'Anna', rollen: [] }] } },
  );
});
