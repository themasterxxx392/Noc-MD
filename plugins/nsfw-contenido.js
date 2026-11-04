import fetch from 'node-fetch';

let handler = async (m, { conn, command }) => {
  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // URL exacta basada en el endpoint /sfw/neko que mostraste en la documentación
    const fullUrl = 'https://api.evogb.org/sfw/neko?key=evogb-TyswGrUB';
    
    let res = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://api.evogb.org/',
        'Origin': 'https://api.evogb.org'
      }
    });

    let rawText = await res.text();

    if (!res.ok) {
      console.error(`[Evogb API Error] Status: ${res.status} | Body:`, rawText);
      throw new Error(`Error HTTP ${res.status}: Not Found`);
    }

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (err) {
      json = { data: rawText };
    }

    let imageUrl = json.data || json.result || json.url || json.image;

    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('No se encontró una URL de imagen válida en la respuesta.');
    }

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
handler.tags = ['anime'];
handler.command = ['neko', 'neko2'];

export default handler;
      
