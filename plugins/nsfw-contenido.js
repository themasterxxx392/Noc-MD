import fetch from 'node-fetch';

let handler = async (m, { conn, command }) => {
  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // API key integrada directamente en la URL
    const url = 'https://api.evogb.org/sfw/neko?key=evogb-TyswGrUB';
    
    let res = await fetch(url, {
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
      console.error("[Evogb API Error] Respuesta no es JSON:", rawText);
      throw new Error("La API no devolvió un JSON válido.");
    }

    // Buscamos la imagen en las propiedades comunes que suelen usar estas APIs
    let img = json.url || json.result || json.data || json.image;

    if (!img || typeof img !== 'string') {
      console.error("[Evogb API Error] Estructura JSON inesperada:", json);
      throw new Error('La respuesta de la API no contiene un enlace de imagen válido.');
    }

    // Intentamos enviar la imagen capturando posibles errores de WhatsApp al descargar la URL
    await conn.sendMessage(m.chat, { 
      image: { url: img }, 
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
handler.command = ['neko'];

export default handler;
