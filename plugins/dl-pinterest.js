import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} anime\``, m);
  }

  try {
    let res = await fetch(`https://pinterest-api-v8.vercel.app/search?q=${encodeURIComponent(text)}`);
    let json = await res.json();
    let images = json.result || json.data || json;

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron imágenes.');
    }

    let selectedImages = images.slice(0, 10);

    let albumMedias = selectedImages.map((img) => ({
      image: { url: typeof img === 'string' ? img : (img.images?.url || img.url || img.thumbnail) },
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

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['search'];
handler.command = ['pin', 'pinterest'];

export default handler;
