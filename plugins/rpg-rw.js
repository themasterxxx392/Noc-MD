import nodeFetch from 'node-fetch';
import { promises as fs } from 'fs';
import { db } from '../lib/database.js';

const FILE_PATH = new URL('../lib/characters.json', import.meta.url);
const COOLDOWN_MS = 15 * 1000; // 15 segundos
const EVO_API_KEY = 'evogb-TyswGrUB';
const EVO_SAFEBOORU_URL = 'https://api.evogb.org/nsfw/safebooru';

// Guarda la última tirada por chat para futuros comandos como reclamar/harem
export const lastRollsByChat = new Map();

let tablesInitialized = false;

async function ensureGachaTables() {
  if (tablesInitialized) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS gacha_characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 100,
      owner_id TEXT,
      reserved_by TEXT,
      reserved_until BIGINT DEFAULT 0,
      expires_at BIGINT DEFAULT 0
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS gacha_cooldowns (
      user_id TEXT PRIMARY KEY,
      next_roll_at BIGINT NOT NULL DEFAULT 0
    );
  `);

  tablesInitialized = true;
}

async function loadCharacters() {
  const fileContent = await fs.readFile(FILE_PATH, 'utf-8');
  return JSON.parse(fileContent);
}

function flattenCharacters(characters) {
  return Object.entries(characters).flatMap(
    ([, series]) => (Array.isArray(series?.characters) ? series.characters : [])
  );
}

function getSeriesNameByCharacter(characters, characterId) {
  return (
    Object.values(characters).find(
      (series) =>
        Array.isArray(series?.characters) &&
        series.characters.some((char) => String(char?.id) === String(characterId))
    )?.name || 'Desconocido'
  );
}

function formatTag(tag) {
  return String(tag || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function looksLikeErrorPayload(buffer) {
  if (!buffer || buffer.length === 0) return true;
  // Si empieza con '{' o '[', revisamos si es un JSON de error sin imagen
  const firstByte = buffer[0];
  if (firstByte === 0x7b || firstByte === 0x5b) {
    const text = buffer.toString('utf8').slice(0, 500);
    if (/error|invalid|not found|no results|no images|unauthorized|key/i.test(text) && !/https?:\/\//i.test(text)) {
      return true;
    }
  }
  return false;
}

async function buscarImagenBuffer(tag, fallbackName = '') {
  const queries = [formatTag(tag), formatTag(fallbackName)].filter(Boolean);

  for (const query of queries) {
    const endpoint = `${EVO_SAFEBOORU_URL}?key=${encodeURIComponent(EVO_API_KEY)}&keyword=${encodeURIComponent(query)}`;
    try {
      const response = await nodeFetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'image/*, application/json, */*',
        },
      });

      if (!response.ok) continue;

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (looksLikeErrorPayload(buffer)) continue;

      // Si responde como imagen directa (PNG, JPG, WEBP, GIF, octet-stream, etc.)
      if (
        contentType.startsWith('image/') ||
        contentType.includes('octet-stream') ||
        buffer.subarray(0, 3).toString('ascii') === 'GIF' ||
        buffer[0] === 0xff || // JPEG
        buffer[0] === 0x89 || // PNG
        buffer.toString('ascii', 8, 12) === 'WEBP'
      ) {
        const ext =
          contentType.includes('gif') || buffer.subarray(0, 3).toString('ascii') === 'GIF'
            ? 'gif'
            : contentType.includes('png') || buffer[0] === 0x89
              ? 'png'
              : contentType.includes('webp')
                ? 'webp'
                : 'jpg';
        return { buffer, ext };
      }

      // Por si algún día devuelve texto/JSON con una URL
      const text = buffer.toString('utf8').trim();
      const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
      if (urlMatch) {
        const imgRes = await nodeFetch(urlMatch[0]);
        if (imgRes.ok) {
          const imgBuf = Buffer.from(await imgRes.arrayBuffer());
          if (imgBuf.length > 0) return { buffer: imgBuf, ext: 'jpg' };
        }
      }
    } catch {
      // Intenta con la siguiente consulta
    }
  }

  return null;
}

const handler = async (message, { conn, usedPrefix, command }) => {
  try {
    await ensureGachaTables();

    const now = Date.now();
    const sender = message.sender;

    // Revisar cooldown de 15 segundos en PostgreSQL
    const cdRes = await db.query(
      'SELECT next_roll_at FROM gacha_cooldowns WHERE user_id = $1',
      [sender]
    );
    const nextRollAt = Number(cdRes.rows?.[0]?.next_roll_at || 0);

    if (nextRollAt > now) {
      const remainingSeconds = Math.ceil((nextRollAt - now) / 1000);
      return message.reply(
        `ꕥ Debes esperar *${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}* para usar *${usedPrefix}${command}* de nuevo.`
      );
    }

    const allCharacters = await loadCharacters();
    const flatCharacters = flattenCharacters(allCharacters);

    if (!flatCharacters.length) {
      return message.reply('⚠️ No hay personajes cargados en `./lib/characters.json`.');
    }

    const randomCharacter = flatCharacters[Math.floor(Math.random() * flatCharacters.length)];
    const characterId = String(randomCharacter.id);
    const seriesName = getSeriesNameByCharacter(allCharacters, characterId);
    const primaryTag = randomCharacter.tags?.[0] || '';
    const mediaResult = await buscarImagenBuffer(primaryTag, randomCharacter.name);

    if (!mediaResult?.buffer) {
      return message.reply(`ꕥ No se encontraron imágenes para el personaje *${randomCharacter.name}*.`);
    }

    // Consultar estado previo del personaje en PostgreSQL
    const existingRes = await db.query(
      'SELECT * FROM gacha_characters WHERE id = $1',
      [characterId]
    );
    const existing = existingRes.rows?.[0];

    const charName = String(randomCharacter.name || 'Sin nombre');
    const charValue =
      typeof existing?.value === 'number'
        ? existing.value
        : Number(randomCharacter.value) || 100;
    const ownerId = existing?.owner_id || null;
    const reservedUntil = now + 20 * 1000; // 20s de prioridad para quien tiró
    const expiresAt = now + 60 * 60 * 1000; // 60 min

    await db.query(
      `INSERT INTO gacha_characters (id, name, value, owner_id, reserved_by, reserved_until, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         value = EXCLUDED.value,
         reserved_by = EXCLUDED.reserved_by,
         reserved_until = EXCLUDED.reserved_until,
         expires_at = EXCLUDED.expires_at`,
      [characterId, charName, charValue, ownerId, sender, reservedUntil, expiresAt]
    );

    // Guardar cooldown de 15 segundos
    await db.query(
      `INSERT INTO gacha_cooldowns (user_id, next_roll_at)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET next_roll_at = EXCLUDED.next_roll_at`,
      [sender, now + COOLDOWN_MS]
    );

    let ownerDisplay = 'Libre';
    const mentions = [];
    if (ownerId) {
      const ownerTag = ownerId.split('@')[0];
      const ownerName =
        (await conn
          .getName(ownerId)
          .then((n) => (typeof n === 'string' && n.trim() ? n : ownerTag))
          .catch(() => ownerTag)) || ownerTag;
      ownerDisplay = `Reclamado por @${ownerTag} (${ownerName})`;
      mentions.push(ownerId);
    }

    const messageText =
      `❀ Nombre » *${charName}*\n` +
      `⚥ Género » *${randomCharacter.gender || 'Desconocido'}*\n` +
      `✰ Valor » *${charValue.toLocaleString()}* 🪙\n` +
      `♡ Estado » *${ownerDisplay}*\n` +
      `❖ Fuente » *${seriesName}*`;

    const sentMessage = await conn.sendFile(
      message.chat,
      mediaResult.buffer,
      `${charName}.${mediaResult.ext}`,
      messageText,
      message,
      false,
      { mentions }
    );

    lastRollsByChat.set(message.chat, {
      characterId,
      name: charName,
      value: charValue,
      rolledBy: sender,
      rolledAt: now,
      msgId: sentMessage?.key?.id || sentMessage?.message?.id || null,
    });
  } catch (error) {
    await conn.reply(
      message.chat,
      `⚠︎ Se ha producido un problema en el gacha.\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`,
      message
    );
  }
};

handler.help = ['gacha', 'rw', 'rollwaifu'];
handler.tags = ['gacha'];
handler.command = /^(rollwaifu|rw|gacha)$/i;

export default handler;
