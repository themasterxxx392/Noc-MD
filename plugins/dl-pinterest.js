import fetch from 'node-fetch';
import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let res = await fetch(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
    let json = await res.json();
    
    let images = json.data || json.result || json.results || (Array.isArray(json) ? json : []);

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('La API no devolvió ninguna imagen válida.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      let item = selectedImages[i];
      let imgUrl = typeof item === 'string' ? item : (item.image || item.url || item.thumbnail || item.media || item.pin || item.origin?.url);
      
      if (imgUrl) {
        try {
          // Descargamos la imagen como búfer para evitar que WhatsApp rechace el enlace directo
          let response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
          let buffer = Buffer.from(response.data);

          await conn.sendMessage(m.chat, { 
            image: buffer, 
            caption: '' 
          }, { quoted: m });
          
          sentCount++;

          if (i < selectedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 400));
          }
        } catch (err) {
          // Si una imagen específica falla en la descarga, la saltamos y seguimos con la que sigue
          console.error(`Error descargando imagen ${i}:`, err.message);
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo descargar ninguna imagen de los resultados.');
    }

    // Reacción de éxito
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    // Reacción de error y aviso en el chat
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['downloader'];
handler.command = ['pinterest'];

export default handler;
