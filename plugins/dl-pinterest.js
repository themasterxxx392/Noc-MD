import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let res = await fetch(`https://delirius-api-oficial.vercel.app/tools/pinterest?q=${encodeURIComponent(text)}`);
    let textResponse = await res.text();

    // Verificamos si la respuesta es HTML o error de Cloudflare en vez de JSON
    let json;
    try {
      json = JSON.parse(textResponse);
    } catch (err) {
      throw new Error('La API de Pinterest está caída o bloqueó la solicitud temporalmente.');
    }

    let images = json.data || json.result || json;

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron imágenes para esa búsqueda.');
    }

    let selectedImages = images.slice(0, 10);

    let albumMedias = selectedImages.map((img) => ({
      image: { url: typeof img === 'string' ? img : (img.image || img.url || img.thumbnail) },
      caption: ''
    }));

    if (typeof conn.sendAlbumMessage === 'function') {
      await conn.sendAlbumMessage(m.chat, albumMedias, { quoted: m });
    } else if (typeof conn.sendSylphy === 'function') {
      let medias = albumMedias.map(item => ({ type: 'image', data: { url: item.image.url }, caption: '' }));
      await conn.sendSylphy(m.chat, medias, { quoted: m });
    } else {
      for (let media of albumMedias) {
        await conn.sendMessage(m.chat, { image: { url: media.image.url }, caption: '' }, { quoted: m });
      }
    }

    // Reacción de éxito
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    // Reacción de error y mensaje explicativo claro
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['search', 'downloader'];
handler.command = ['pin', 'pinterest'];

export default handler;
