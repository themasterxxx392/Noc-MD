import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // Usamos un endpoint alternativo sumamente estable para la búsqueda de Pinterest
    let res = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
    let json = await res.json();
    
    let images = json.data || json.result || json;

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron resultados para esa búsqueda.');
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
