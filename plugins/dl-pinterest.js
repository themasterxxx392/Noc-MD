import fetch from 'node-fetch';
import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let images = [];
    let query = encodeURIComponent(text);

    // Lista de endpoints de respaldo (si uno falla por Cloudflare, salta al siguiente)
    let apis = [
      `https://delirius-api-oficial.vercel.app/tools/pinterest?q=${query}`,
      `https://api.siputzx.my.id/api/s/pinterest?query=${query}`,
      `https://api.vyturex.com/pinterest?query=${query}`
    ];

    for (let apiUrl of apis) {
      try {
        let res = await fetch(apiUrl);
        let textData = await res.text();
        
        // Verificamos que sea JSON válido y no una página de bloqueo de Cloudflare
        if (textData.startsWith('<') || textData.includes('This content')) continue;
        
        let json = JSON.parse(textData);
        let data = json.data || json.result || json.results || (Array.isArray(json) ? json : []);
        
        if (Array.isArray(data) && data.length > 0) {
          images = data;
          break; // Si una API responde bien, rompemos el ciclo y usamos sus datos
        }
      } catch (err) {
        // Continuamos con la siguiente API si esta falla
      }
    }

    if (!images.length) {
      throw new Error('Todas las APIs de Pinterest están bloqueadas temporalmente. Inténtalo más tarde.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      let item = selectedImages[i];
      let imgUrl = typeof item === 'string' ? item : (item.image || item.url || item.thumbnail || item.media);
      
      if (imgUrl) {
        try {
          // Descarga por búfer con Axios para evitar el error de archivo gris/dañado en WhatsApp
          let imageResponse = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 5000 });
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
          console.error(`Error al descargar imagen individual:`, err.message);
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo descargar ninguna imagen de los resultados obtenidos.');
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
handler.tags = ['search', 'downloader'];
handler.command = ['pin', 'pinterest'];

export default handler;
      
