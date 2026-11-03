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

    // Envío rápido y consecutivo para que WhatsApp las agrupe automáticamente en formato de galería/álbum
    for (let i = 0; i < selectedImages.length; i++) {
      let imgUrl = typeof selectedImages[i] === 'string' ? selectedImages[i] : (selectedImages[i].image || selectedImages[i].url || selectedImages[i].thumbnail || selectedImages[i].media);
      
      if (imgUrl) {
        await conn.sendMessage(m.chat, { 
          image: { url: imgUrl }, 
          caption: '' 
        }, { quoted: m });

        // Una pausa imperceptible de 300ms para mantener el orden y asegurar que WhatsApp las agrupe como álbum
        if (i < selectedImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
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
