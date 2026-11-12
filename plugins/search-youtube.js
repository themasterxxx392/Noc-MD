let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.reply(m.chat, "_✿ Ingresa qué quieres buscar en YouTube._", m);
  }
  
  const base = global.info?.evogb;
  const key = global.info?.evogbkey;

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const searchUrl = `${base}/search/yt?query=${encodeURIComponent(text.trim())}&key=${encodeURIComponent(key)}`;

    let res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let json = await res.json();

    if (!json.status || !Array.isArray(json.result) || !json.result.length) {
      throw new Error('No se encontraron resultados en YouTube.');
    }

    let videos = json.result.slice(0, 20);

    let txt = videos.map((v, i) => 
`*[${i+1}] ${v.title}*
> Canal: ${v.autor}
> Duración: ${v.duration}
> Vistas: ${v.views}
> Subido: ${v.uploaded}
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
