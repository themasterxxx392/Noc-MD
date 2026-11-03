import fetch from 'node-fetch';
import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // Usamos un endpoint de búsqueda directa con respaldo múltiple de estructura
    let res = await fetch(`https://delirius-api-oficial.vercel.app/tools/pinterest?q=${encodeURIComponent(text)}`);
    let json = await res.json();
    
    let images = json.data || json.result || json.results || (Array.isArray(json) ? json : []);

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron imágenes para esa búsqueda.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      let item = selectedImages[i];
      let imgUrl = typeof item === 'string' ? item : (item.image || item.url || item.thumbnail || item.media);
      
      if (imgUrl) {
        try {
          // Descarga por búfer usando Axios para evitar errores de enlace directo
          let imageResponse = await axios.get(imgUrl, { responseType: 'arraybuffer' });
          let buffer = Buffer.from(imageResponse.data);

          await conn.sendMessage(m.chat, { 
            image: buffer, 
            caption: '' 
          }, { quoted: m });
          
          sentCount++;

          if (i < selectedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (err) {
          console.error(`Error al enviar imagen individual:`, err.message);
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo descargar ninguna imagen.');
    }

    // Reacción de éxito ✔️
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    // Reacción de error ✖️ con el detalle exacto
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['downloader'];
handler.command = ['pinterest'];

export default handler;
