import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa qué quieres buscar en Pinterest.\n\n*Ejemplo:* \`${usedPrefix + command} rem re zero\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const apikey = 'YUME_30c75365cf5d8687';
    let searchUrl = `https://nexus--shadowxyz189.replit.app/search/pinterest?q=${encodeURIComponent(text)}&count=10&key=${apikey}`;
    
    let { data: response } = await axios.get(searchUrl);
    let images = response.data?.results || response.data || response.result || [];

    if (!Array.isArray(images) || images.length === 0) {
      throw new Error('No se encontraron imágenes en Pinterest.');
    }

    let selectedImages = images.slice(0, 10);
    let sentCount = 0;

    for (let i = 0; i < selectedImages.length; i++) {
      let item = selectedImages[i];
      let imgUrl = typeof item === 'string' ? item : (item.image || item.url || item.thumbnail);
      
      if (imgUrl) {
        try {
          // Descarga por búfer usando Axios directamente desde los enlaces estables de Nexus
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
          console.error(`Fallo al enviar imagen ${i}:`, err.message);
        }
      }
    }

    if (sentCount === 0) {
      throw new Error('No se pudo procesar ninguna imagen.');
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
                         
