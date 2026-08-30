import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, roh, maskiere } from '../../src/web/html/html.mjs';

test('eingesetzte Werte werden maskiert, ohne dass die Seite daran denken muss', () => {
  const boese = '<script>alert(1)</script>';

  const ausgabe = String(html`<p>${boese}</p>`);

  assert.ok(!ausgabe.includes('<script>'), 'Das Skript steht ungefiltert in der Ausgabe');
  assert.match(ausgabe, /&lt;script&gt;/);
});

test('alle fünf gefährlichen Zeichen werden maskiert', () => {
  assert.equal(maskiere(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('ein Wert in einem Attribut kann nicht ausbrechen', () => {
  const boese = '" onmouseover="alert(1)';

  const ausgabe = String(html`<a title="${boese}">x</a>`);

  assert.ok(!ausgabe.includes('onmouseover="alert'), 'Der Ausbruch aus dem Attribut gelang');
});

test('bewusst als sicher erklärter Text wird nicht ein zweites Mal maskiert', () => {
  const teil = html`<b>fett</b>`;

  const ausgabe = String(html`<p>${teil}</p>`);

  assert.equal(ausgabe, '<p><b>fett</b></p>');
});

test('roh() erklärt eine Zeichenkette ausdrücklich für sicher', () => {
  assert.equal(String(html`<p>${roh('<br>')}</p>`), '<p><br></p>');
});

test('eine Liste von Teilen wird ohne Trennzeichen zusammengesetzt', () => {
  const zeilen = ['a', 'b'].map((x) => html`<li>${x}</li>`);

  assert.equal(String(html`<ul>${zeilen}</ul>`), '<ul><li>a</li><li>b</li></ul>');
});

test('fehlende Werte werden zu nichts, nicht zu "undefined"', () => {
  assert.equal(String(html`<p>${undefined}${null}</p>`), '<p></p>');
});

test('Zahlen und Wahrheitswerte werden lesbar eingesetzt', () => {
  assert.equal(String(html`<p>${42}</p>`), '<p>42</p>');
  assert.equal(String(html`<p>${0}</p>`), '<p>0</p>');
});

test('false wird zu nichts — damit bedingte Teile weggelassen werden können', () => {
  const zeigen = false;

  assert.equal(String(html`<p>${zeigen && html`<b>x</b>`}</p>`), '<p></p>');
});
