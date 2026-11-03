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
    } catch (err) {}

    // Intento 2 (Respaldo): Segunda API si la primera falla
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

    // Mapeo seguro para el álbum de imágenes sin texto
    let albumCards = selectedImages.map((img) => {
      let imgUrl = typeof img === 'string' ? img : (img.image || img.url || img.thumbnail || img.media);
      return {
        header: '',
        footer: '',
        body: { text: '' },
        image: { url: imgUrl }
      };
    });

    // Envío del álbum en una sola burbuja de forma limpia
    if (typeof conn.sendAlbumMessage === 'function') {
      await conn.sendAlbumMessage(m.chat, albumCards, { quoted: m });
    } else {
      let content = {
        albumMessage: {
          expectedImageCount: albumCards.length,
          cards: albumCards
        }
      };
      let msg = conn.generateWAMessageFromContent(m.chat, content, { quoted: m });
      await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
    }

    // Reacción de éxito si todo salió bien
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    // Reacción de error y mensaje explicativo claro
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['downloader'];
handler.command = ['pinterest'];

export default handler;
