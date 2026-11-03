import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let images = [];
    
    // Intento 1: Primera API alternativa
    try {
      let res1 = await fetch(`https://delirius-api-oficial.vercel.app/tools/pinterest?q=${encodeURIComponent(text)}`);
      let json1 = await res1.json();
      let data1 = json1.data || json1.result || json1;
      if (Array.isArray(data1) && data1.length > 0) {
        images = data1;
      }
    } catch (err) {
      // Si falla, pasamos al respaldo silenciosamente
    }

    // Intento 2 (Respaldo): Si la primera falló, probamos con otra fuente directa
    if (images.length === 0) {
      let res2 = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
      let json2 = await res2.json();
      let data2 = json2.data || json2.result || json2;
      if (Array.isArray(data2) && data2.length > 0) {
        images = data2;
      }
    }

    if (!images.length) {
      throw new Error('Todas las APIs de Pinterest están ocupadas o no devolvieron resultados.');
    }

    let selectedImages = images.slice(0, 10);

    let albumMedias = selectedImages.map((img) => ({
      image: { url: typeof img === 'string' ? img : (img.image || img.url || img.thumbnail || img.media) },
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
