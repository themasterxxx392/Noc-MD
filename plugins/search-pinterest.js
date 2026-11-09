import axios from 'axios';
import * as baileys from '@whiskeysockets/baileys';

const { generateWAMessageFromContent, generateWAMessage } = baileys.generateWAMessage ? baileys : baileys.default;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.pinterest.com/'
};

async function descargar(url) {
  let r = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 30000 });
  return Buffer.from(r.data);
}

async function obtenerImagen(pin) {
  for (const imgUrl of [pin?.hd, pin?.mini]) {
    if (!imgUrl) continue;
    try {
      const buffer = await descargar(imgUrl);
      if (buffer.length > 1000) return buffer;
    } catch (err) {
      console.error(`Error al descargar imagen (${imgUrl}):`, err.message);
    }
  }
  return null;
}

async function enviarAlbum(conn, jid, buffers, quoted) {
  const album = generateWAMessageFromContent(jid, {
    messageContextInfo: {},
    albumMessage: {
      expectedImageCount: buffers.length,
      expectedVideoCount: 0,
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

  for (const image of buffers) {
    const img = await generateWAMessage(album.key.remoteJid, { image }, { upload: conn.waUploadToServer });
    img.message.messageContextInfo = {
      messageAssociation: { associationType: 1, parentMessageKey: album.key }
    };
    await conn.relayMessage(img.key.remoteJid, img.message, { messageId: img.key.id });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  const base = global.info?.evogb;
  const key = global.info?.evogbkey;

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let searchUrl = `${base}/search/pinterest?query=${encodeURIComponent(text.trim())}&key=${encodeURIComponent(key)}`;

    let { data: response } = await axios.get(searchUrl, { timeout: 30000 });
    let pins = response?.data;

    if (!response?.status || !Array.isArray(pins) || pins.length === 0) {
      throw new Error('No se encontraron imágenes en Pinterest.');
    }

    const buffers = (await Promise.all(pins.slice(0, 10).map(obtenerImagen))).filter(Boolean);

    if (!buffers.length) {
      throw new Error('No se pudo procesar ninguna imagen.');
    }

    if (buffers.length === 1) {
      await conn.sendMessage(m.chat, { image: buffers[0] }, { quoted: m });
    } else {
      try {
        await enviarAlbum(conn, m.chat, buffers, m);
      } catch (err) {
        console.error('Error al enviar el álbum, se envían por separado:', err.message);
        for (const image of buffers) {
          await conn.sendMessage(m.chat, { image }, { quoted: m });
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin'];
handler.tags = ['buscadores'];
handler.command = ['pin', 'pinterest'];

export default handler;
