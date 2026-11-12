import axios from 'axios';
import * as baileys from '@whiskeysockets/baileys';

const { generateWAMessageFromContent, generateWAMessage } = baileys.generateWAMessage ? baileys : baileys.default;

const MAX_VIDEO = 20 * 1024 * 1024;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.tiktok.com/'
};

async function descargarVideo(item) {
  const peso = Number(item?.size?.without_watermark) || Number(item?.size?.with_watermark) || 0;
  if (!item?.dl || peso > MAX_VIDEO) return null;
  try {
    const r = await axios.get(item.dl, {
      responseType: 'arraybuffer',
      headers: HEADERS,
      timeout: 45000,
      maxContentLength: MAX_VIDEO,
      maxBodyLength: MAX_VIDEO
    });
    if (String(r.headers['content-type'] || '').includes('text/html')) return null;
    const buffer = Buffer.from(r.data);
    return buffer.length > 1000 ? buffer : null;
  } catch (err) {
    console.error(`Error al descargar video (${item.id}):`, err.message);
    return null;
  }
}

async function enviarAlbum(conn, jid, videos, quoted) {
  const album = generateWAMessageFromContent(jid, {
    messageContextInfo: {},
    albumMessage: {
      expectedImageCount: 0,
      expectedVideoCount: videos.length,
      ...(quoted ? {
        contextInfo: {
          remoteJid: quoted.key.remoteJid,
          fromMe: quoted.key.fromMe,
          stanzaId: quoted.key.id,
          participant: quoted.key.participant || quoted.key.remoteJid,
          quotedMessage: quoted.message
        }
      } : {})
    }
  }, {});

  await conn.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id });

  for (const video of videos) {
    const msg = await generateWAMessage(album.key.remoteJid, { video, mimetype: 'video/mp4' }, { upload: conn.waUploadToServer });
    msg.message.messageContextInfo = {
      messageAssociation: { associationType: 1, parentMessageKey: album.key }
    };
    await conn.relayMessage(msg.key.remoteJid, msg.message, { messageId: msg.key.id });
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.reply(m.chat, `_✿ Ingresa qué quieres buscar en TikTok._`, m);
  }

  const base = global.info?.evogb;
  const key = global.info?.evogbkey;

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const { data: res } = await axios.get(`${base}/search/tiktok`, {
      params: { key, query: text.trim() },
      timeout: 30000
    });

    const items = res?.data;

    if (!res?.status || !Array.isArray(items) || items.length === 0) {
      throw new Error('No se encontraron videos en TikTok.');
    }

    const videos = (await Promise.all(items.slice(0, 10).map(descargarVideo))).filter(Boolean);

    if (!videos.length) {
      throw new Error('No se pudo descargar ningún video.');
    }

    if (videos.length === 1) {
      await conn.sendMessage(m.chat, { video: videos[0], mimetype: 'video/mp4' }, { quoted: m });
    } else {
      try {
        await enviarAlbum(conn, m.chat, videos, m);
      } catch (err) {
        console.error('Error al enviar el álbum, se envían por separado:', err.message);
        for (const video of videos) {
          await conn.sendMessage(m.chat, { video, mimetype: 'video/mp4' }, { quoted: m });
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error('Error en tiktoksearch:', e.message);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en TikTok.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['tiktoksearch'];
handler.tags = ['buscadores'];
handler.command = ['tts', 'tiktoksearch'];

export default handler;
