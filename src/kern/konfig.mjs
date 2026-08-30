/**
 * Konfiguration aus der Umgebung lesen und pruefen.
 *
 * Grundsatz: Lieber beim Start mit einer benannten Meldung abbrechen, als mit
 * einer halben Konfiguration weiterlaufen und spaeter an unverstaendlicher
 * Stelle scheitern. Deshalb werden alle Maengel gesammelt und gemeinsam
 * gemeldet — wer drei Variablen vergessen hat, will das einmal erfahren und
 * nicht dreimal hintereinander.
 */

const NODE_MINDESTENS = [22, 13, 0];
const SESSION_SECRET_MINDESTLAENGE = 32;

/** Pflichtvariablen mit dem Hinweis, wo der Wert herkommt. */
const PFLICHT = [
  ['DISCORD_TOKEN', 'Entwicklerportal → deine Application → Bot → Reset Token'],
  ['DISCORD_CLIENT_ID', 'Entwicklerportal → deine Application → OAuth2 → Client ID'],
  ['DISCORD_CLIENT_SECRET', 'Entwicklerportal → deine Application → OAuth2 → Client Secret'],
  ['GUILD_ID', 'Discord → Rechtsklick auf den Server → Server-ID kopieren'],
  ['OWNER_DISCORD_ID', 'Discord → Rechtsklick auf dein Profil → Benutzer-ID kopieren'],
  ['PANEL_URL', 'Die Adresse, unter der das Panel erreichbar ist, z. B. http://140.10.20.30:3000'],
  ['SESSION_SECRET', 'Wird von `npm run setup` zufaellig erzeugt'],
];

/** Zahlenwerte: Name in der Umgebung, Name in der Konfiguration, Vorgabe, kleinster erlaubter Wert. */
const ZAHLEN = [
  ['PORT', 'port', 3000, 1, 65535],
  ['DM_MAX_RECIPIENTS', 'dmMaxEmpfaenger', 100, 1, 100000],
  ['DM_DELAY_MS', 'dmPauseMs', 1200, 0, 600000],
  ['UPLOAD_MAX_BYTES', 'uploadMaxBytes', 5242880, 1024, 104857600],
  ['UPLOAD_MAX_EDGE', 'uploadMaxKante', 4096, 64, 16384],
];

export class KonfigFehler extends Error {
  constructor(maengel) {
    super(
      'Der Start wurde abgebrochen, weil die Konfiguration nicht stimmt:\n' +
        maengel.map((m) => `  • ${m}`).join('\n') +
        '\n\nAlles davon richtet `npm run setup` ein.',
    );
    this.name = 'KonfigFehler';
    this.maengel = maengel;
  }
}

function versionMindestens(version, mindestens) {
  const teile = String(version)
    .split('.')
    .map((t) => Number.parseInt(t, 10) || 0);
  for (let i = 0; i < mindestens.length; i += 1) {
    const ist = teile[i] ?? 0;
    if (ist > mindestens[i]) return true;
    if (ist < mindestens[i]) return false;
  }
  return true;
}

function leseZahl(umgebung, [name, schluessel, vorgabe, min, max], maengel) {
  const roh = umgebung[name];
  if (roh === undefined || roh === '') return [schluessel, vorgabe];

  const wert = Number(roh);
  if (!Number.isInteger(wert)) {
    maengel.push(`${name} muss eine ganze Zahl sein.`);
    return [schluessel, vorgabe];
  }
  if (wert < min || wert > max) {
    maengel.push(`${name} muss zwischen ${min} und ${max} liegen.`);
    return [schluessel, vorgabe];
  }
  return [schluessel, wert];
}

function lesePanelUrl(roh, maengel) {
  let url;
  try {
    url = new URL(roh);
  } catch {
    maengel.push('PANEL_URL ist keine gueltige Adresse. Beispiel: http://140.10.20.30:3000');
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    maengel.push('PANEL_URL muss mit http:// oder https:// beginnen.');
    return null;
  }
  return url;
}

/**
 * @param {Record<string, string|undefined>} umgebung
 * @param {string} nodeVersion
 * @throws {KonfigFehler} wenn die Konfiguration unvollstaendig oder unbrauchbar ist
 */
export function leseKonfig(umgebung = process.env, nodeVersion = process.versions.node) {
  const maengel = [];

  if (!versionMindestens(nodeVersion, NODE_MINDESTENS)) {
    maengel.push(
      `Node ${nodeVersion} ist zu alt. Gebraucht wird mindestens ${NODE_MINDESTENS.slice(0, 2).join('.')} ` +
        '(empfohlen: 24 LTS), weil das Panel die eingebaute SQLite-Unterstuetzung nutzt.',
    );
  }

  for (const [name, herkunft] of PFLICHT) {
    const wert = umgebung[name];
    if (wert === undefined || String(wert).trim() === '') {
      maengel.push(`${name} fehlt. Herkunft: ${herkunft}`);
    }
  }

  const secret = umgebung.SESSION_SECRET;
  if (secret && secret.length < SESSION_SECRET_MINDESTLAENGE) {
    maengel.push(
      `SESSION_SECRET ist zu kurz (${secret.length} Zeichen, gebraucht werden ${SESSION_SECRET_MINDESTLAENGE}).`,
    );
  }

  const zahlen = Object.fromEntries(ZAHLEN.map((eintrag) => leseZahl(umgebung, eintrag, maengel)));

  const panelUrl = umgebung.PANEL_URL ? lesePanelUrl(umgebung.PANEL_URL, maengel) : null;
  const vertraueProxy = umgebung.TRUST_PROXY === '1';
  const ueberHttps = panelUrl?.protocol === 'https:';

  if (ueberHttps && !vertraueProxy) {
    maengel.push(
      'PANEL_URL ist eine https-Adresse, aber TRUST_PROXY ist nicht auf 1 gesetzt. ' +
        'Ohne TRUST_PROXY=1 haelt das Panel die Verbindung fuer unverschluesselt und setzt das ' +
        'Sitzungs-Cookie ohne Secure-Kennzeichen — es liefe dann im Klartext durchs Netz.',
    );
  }

  if (maengel.length > 0) throw new KonfigFehler(maengel);

  const basis = panelUrl.href.replace(/\/+$/, '');

  return {
    ...zahlen,
    token: umgebung.DISCORD_TOKEN,
    clientId: umgebung.DISCORD_CLIENT_ID,
    clientSecret: umgebung.DISCORD_CLIENT_SECRET,
    guildId: umgebung.GUILD_ID,
    ownerId: umgebung.OWNER_DISCORD_ID,
    sessionSecret: umgebung.SESSION_SECRET,
    panelUrl: basis,
    redirectUri: `${basis}/auth/callback`,
    vertraueProxy,
    sicheresCookie: ueberHttps,
  };
}
