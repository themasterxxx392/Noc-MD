import fetch from 'node-fetch';

let handler = async (m, { conn, command }) => {
  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const url = 'https://api.evogb.org/sfw/neko?key=evogb-TyswGrUB';
    
    let res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`La API respondió con código HTTP ${res.status}`);
    }

    let json = await res.json();
    
    // Si la API devuelve la URL de la imagen en 'url' o 'result'
    let img = json.url || json.result;

    if (!img) {
      throw new Error('No se pudo obtener la imagen.');
    }

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
