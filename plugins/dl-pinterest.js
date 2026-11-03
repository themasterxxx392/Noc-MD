import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let res = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
    let json = await res.json();
    
    let images = json.data || json.result || json;

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron resultados para esa búsqueda.');
    }

    let selectedImages = images.slice(0, 10);

    // Mapeo limpio adaptado para que el framework arme el grupo de imágenes correctamente
    let albumMedias = selectedImages.map((img) => {
      let imgUrl = typeof img === 'string' ? img : (img.image || img.url || img.thumbnail || img.media);
      return {
        image: { url: imgUrl },
        caption: ''
      };
    });

    // Envío por álbum nativo soportado en la estructura de LoliBot
    if (typeof conn.sendAlbumMessage === 'function') {
      await conn.sendAlbumMessage(m.chat, albumMedias, { quoted: m });
    } else if (typeof conn.sendFile === 'function' && albumMedias.length > 0) {
      // Método alternativo si el bot agrupa por lotes de envío multimedia
      for (let media of albumMedias) {
        await conn.sendMessage(m.chat, { image: media.image, caption: '' }, { quoted: m });
      }
    } else {
      // Estructura de respaldo para carrusel/álbum estándar de Baileys
      let cards = albumMedias.map(item => ({
        body: { text: '' },
        footer: '',
        header: { 
          hasMediaAttachment: true, 
          imageMessage: item.image 
        }
      }));
      
      await conn.relayMessage(m.chat, {
        viewOnceMessage: {
          message: {
            carouselMessage: {
              cards: cards
            }
          }
        }
      }, { quoted: m });
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
