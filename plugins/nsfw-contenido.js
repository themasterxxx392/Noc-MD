import fetch from 'node-fetch';

let handler = async (m, { conn, command }) => {
  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    // Extraemos la URL base y la API key desde config.js
    const baseUrl = global.info?.evogb || 'https://api.evogb.org';
    const apiKey = global.info?.evogbkey || 'evogb-TyswGrUB';
    const endpoint = '/sfw/neko';

    const fullUrl = `${baseUrl}${endpoint}?key=${apiKey}`;
    
    let res = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}: Not Found`);
    }

    const contentType = res.headers.get('content-type') || '';
    
    if (contentType.includes('image')) {
      let buffer = await res.buffer();
      await conn.sendMessage(m.chat, { 
        image: buffer, 
        caption: '🐱 *Neko*' 
      }, { quoted: m });
    } else {
      let rawText = await res.text();
      let json = JSON.parse(rawText);
      let imageUrl = json.data || json.result || json.url || json.image;

      if (!imageUrl) throw new Error('No se encontró una URL de imagen válida.');

      await conn.sendMessage(m.chat, { 
        image: { url: imageUrl }, 
        caption: '🐱 *Neko*' 
      }, { quoted: m });
    }

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
