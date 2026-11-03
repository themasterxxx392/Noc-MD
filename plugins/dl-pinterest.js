import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let res = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
    let json = await res.json();
    
    // Capturamos cualquier variante de la estructura de la API
    let images = json.data || json.result || json.results || (Array.isArray(json) ? json : []);

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('La API no devolvió ninguna imagen válida.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    // Envío rápido consecutivo para que WhatsApp las agrupe como galería
    for (let i = 0; i < selectedImages.length; i++) {
      let item = selectedImages[i];
      let imgUrl = typeof item === 'string' ? item : (item.image || item.url || item.thumbnail || item.media || item.pin || item.origin?.url);
      
      if (imgUrl) {
        await conn.sendMessage(m.chat, { 
          image: { url: imgUrl }, 
          caption: '' 
        }, { quoted: m });
        sentCount++;

        if (i < selectedImages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo extraer ninguna URL de imagen utilizable.');
    }

    // Reacción de éxito real solo si envió al menos una imagen
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    // Reacción de error y aviso en el chat si algo falló de verdad
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['downloader'];
handler.command = ['pinterest'];

export default handler;
  
