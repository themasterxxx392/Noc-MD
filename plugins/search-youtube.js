import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.reply(m.chat, "✿ Ingresa texto para buscar en Youtube.", m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const searchUrl = `${global.info.nexus}/search/yts?q=${encodeURIComponent(text)}&key=${global.info.apikey}`;
    
    let res = await fetch(searchUrl);
    let json = await res.json();

    if (!json.status || !json.data?.results?.length) {
      throw new Error('No se encontraron resultados en YouTube.');
    }

    let videos = json.data.results.slice(0, 20);

    let txt = videos.map((v, i) => 
`*[${i+1}] ${v.title}*
> Canal: ${v.channel?.name || 'Desconocido'}
> Duración: ${v.duration || 'Desconocida'}
> Visitas: ${v.views || v.viewsCount || v.viewCount || 'No disponible'}
> Fecha: ${v.published || v.publishedTime || 'Desconocida'}
> Link: ${v.url}`).join("\n\n");

    await conn.sendMessage(m.chat, { 
      image: { url: videos[0].thumbnail }, 
      caption: txt 
    }, { quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

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
