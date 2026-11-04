import fetch from 'node-fetch';

let handler = async (m, { conn, command }) => {
  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // Definimos la URL base, el endpoint correcto sin /beta y la API Key por separado
    const API_URL = 'https://api.evogb.org';
    const ENDPOINT = '/sfw/neko';
    const API_KEY = 'evogb-TyswGrUB';

    const fullUrl = `${API_URL}${ENDPOINT}?key=${API_KEY}`;
    
    let res = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    let rawText = await res.text();

    if (!res.ok) {
      console.error(`[Evogb API Error] Status: ${res.status} | Body:`, rawText);
      throw new Error(`La API respondió con código HTTP ${res.status}`);
    }

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (err) {
      // Por si la API devuelve texto plano directamente
      json = { data: rawText };
    }

    // Extraemos la URL de la imagen de las propiedades que suele devolver el JSON
    let imageUrl = json.data || json.result || json.url || json.image;

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('No se encontró una URL de imagen válida en la respuesta de la API.');
    }

    // Enviar la imagen usando el enlace obtenido
    await conn.sendMessage(m.chat, { 
      image: { url: imageUrl }, 
      caption: '🐱 *Neko*' 
    }, { quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    m.reply(`> ✿︎ Ocurrió un error al ejecutar el comando *.${command}*.\n> *[Error: ${e.message}]*`);
  }
};

handler.help = ['neko'];
handler.tags = ['nsfw'];
handler.command = ['neko2'];

export default handler;
