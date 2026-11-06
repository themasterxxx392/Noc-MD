import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.pinterest.com/'
};

async function descargar(url) {
  let r = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 30000 });
  return Buffer.from(r.data);
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

    let selectedPins = pins.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedPins.length; i++) {
      let pin = selectedPins[i];
      let buffer = null;

      for (let imgUrl of [pin?.hd, pin?.mini]) {
        if (!imgUrl) continue;
        try {
          buffer = await descargar(imgUrl);
          if (buffer.length > 1000) break;
          buffer = null;
        } catch (err) {
          console.error(`Error al descargar imagen ${i} (${imgUrl}):`, err.message);
        }
      }

      if (!buffer) continue;

      try {
        await conn.sendMessage(m.chat, {
          image: buffer,
          caption: ''
        }, { quoted: m });

        sentCount++;

        if (i < selectedPins.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error(`Error al enviar imagen ${i}:`, err.message);
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo procesar ninguna imagen.');
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['buscadores'];
handler.command = ['pin', 'pinterest'];

export default handler;
