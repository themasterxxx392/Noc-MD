import nodeFetch from 'node-fetch';
import { promises as fs } from 'fs';
import { db } from '../lib/database.js';

const FILE_PATH = new URL('../lib/characters.json', import.meta.url);
const COOLDOWN_MS = 15 * 1000;

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

function detectExtFromBufferOrType(buffer, contentType = '') {
  const ct = String(contentType).toLowerCase();
  if (ct.includes('gif') || buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (ct.includes('png') || (buffer[0] === 0x89 && buffer[1] === 0x50)) return 'png';
  if (ct.includes('webp') || buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return 'jpg';
}

function isBinaryImage(buffer, contentType = '') {
  if (!buffer || buffer.length < 16) return false;
  const ct = String(contentType).toLowerCase();
  return (
    ct.startsWith('image/') ||
    buffer.subarray(0, 3).toString('ascii') === 'GIF' ||
    (buffer[0] === 0xff && buffer[1] === 0xd8) ||
    (buffer[0] === 0x89 && buffer[1] === 0x50) ||
    buffer.toString('ascii', 8, 12) === 'WEBP'
  );
}

function extractUrlsFromJson(parsed) {
  if (!parsed) return [];
  const rawList = Array.isArray(parsed?.results)
    ? parsed.results
    : Array.isArray(parsed)
      ? parsed
      : [
          parsed?.url,
          parsed?.image,
          parsed?.file_url,
          parsed?.large_file_url,
          parsed?.data?.url,
          parsed?.data?.image,
        ];

  return rawList
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        return String(item.url || item.file_url || item.large_file_url || item.image || '').trim();
      }
      return '';
    })
    .filter((u) => /^https?:\/\/\S+/i.test(u));
}

async function downloadImageFromUrl(url) {
  const res = await nodeFetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/*,*/*;q=0.8',
    },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());
  if (!isBinaryImage(buffer, contentType)) return null;
  return {
    buffer,
    ext: detectExtFromBufferOrType(buffer, contentType),
  };
}

function resolveEndpoint(base, route, query, key, extraParams = '') {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const q = encodeURIComponent(query);
  const k = encodeURIComponent(key || '');
  const extra = extraParams ? `&${extraParams}` : '';

  if (cleanBase.includes('/nsfw/')) {
    const root = cleanBase.replace(/\/nsfw\/.*$/, '');
    return `${root}/nsfw/${route}?key=${k}&keyword=${q}${extra}`;
  }
  return `${cleanBase}/nsfw/${route}?key=${k}&keyword=${q}${extra}`;
}

function buildEndpoints(query) {
  const base = global.info?.evogb;
  const key = global.info?.evogbkey;
  if (!base || !key) return [];

  return [
    { type: 'buffer', url: resolveEndpoint(base, 'safebooru', query, key) },
    { type: 'json', url: resolveEndpoint(base, 'danbooru', query, key) },
    { type: 'buffer', url: resolveEndpoint(base, 'gelbooru', query, key, 'json=false') },
  ];
}

async function buscarImagenBuffer(tag, fallbackName = '') {
  const queries = [formatTag(tag), formatTag(fallbackName)].filter(Boolean);

  for (const query of queries) {
    const endpoints = buildEndpoints(query);

    for (const ep of endpoints) {
      try {
        const response = await nodeFetch(ep.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/*, application/json, text/plain, */*',
          },
        });

        if (!response.ok) continue;

        const contentType = response.headers.get('content-type') || '';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (isBinaryImage(buffer, contentType)) {
          return {
            buffer,
            ext: detectExtFromBufferOrType(buffer, contentType),
          };
        }

        const text = buffer.toString('utf8').trim();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }

        const urls = extractUrlsFromJson(parsed);
        if (urls.length > 0) {
          const shuffled = [...urls].sort(() => Math.random() - 0.5).slice(0, 3);
          for (const candidateUrl of shuffled) {
            const downloaded = await downloadImageFromUrl(candidateUrl);
            if (downloaded) return downloaded;
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

const handler = async (message, { conn, usedPrefix, command }) => {
  try {
    await ensureGachaTables();

    const now = Date.now();
    const sender = message.sender;

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
    const reservedUntil = now + 20 * 1000;
    const expiresAt = now + 60 * 60 * 1000;

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
