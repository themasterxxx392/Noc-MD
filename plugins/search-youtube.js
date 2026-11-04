import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.reply(m.chat, "✿ Ingresa texto para buscar en Youtube.", m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const baseUrl = (global.info.evogb || 'https://api.evogb.org/beta').replace(/\/+$/, '');
    const apiKey = global.info.evogbkey || 'evogb-TyswGrUB';
    const searchUrl = `${baseUrl}/search/yt?key=${apiKey}&query=${encodeURIComponent(text)}`;
    
    let res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
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
      throw new Error("La API no devolvió un JSON válido (posible bloqueo o error de servidor).");
    }

    if (!json.status || !json.result?.length) {
      throw new Error('No se encontraron resultados en YouTube.');
    }

    let videos = json.result.slice(0, 20);

    let txt = videos.map((v, i) => 
`*[${i+1}] ${v.title}*
> Canal: ${v.autor}
> Duración: ${v.duration}
> Fecha: ${v.uploaded}
> Link: ${v.url}`).join("\n\n");

    await conn.sendMessage(m.chat, { 
      image: { url: videos[0].banner }, 
      caption: txt 
    }, { quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    m.reply(`> ✿︎ Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> *[Error: ${e.message}]*`);
  }
};

handler.help = ['ytsearch'];
handler.tags = ['buscadores'];
handler.command = ['yts', 'ytsearch'];

export default handler;
