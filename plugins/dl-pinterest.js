import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let searchUrl = `${global.info.nexus}/search/pinterest?q=${encodeURIComponent(text)}&key=${global.info.apikey}`;
    
    let { data: response } = await axios.get(searchUrl);
    let images = response.result?.images || response.data || [];

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron imágenes en Pinterest.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      let imgUrl = selectedImages[i];
      
      if (imgUrl) {
        try {
          let imageResponse = await axios.get(imgUrl, { 
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.pinterest.com/'
            }
          });
          let buffer = Buffer.from(imageResponse.data);

          await conn.sendMessage(m.chat, { 
            image: buffer, 
            caption: '' 
          }, { quoted: m });
          
          sentCount++;

          if (i < selectedImages.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (err) {
          console.error(`Error al enviar imagen ${i}:`, err.message);
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo procesar ninguna imagen.');
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar en Pinterest.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['pin <texto>'];
handler.tags = ['buscadores'];
handler.command = ['pin', 'pinterest'];

export default handler;
