import axios from 'axios';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.reply(m.chat, `✿ Ingresa texto para buscar en Youtube.\n\n*Ejemplo:* \`${usedPrefix + command} anime\`[span_0](start_span)[span_0](end_span)`, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    const apikey = 'YUME_30c75365cf5d8687';
    const searchUrl = `https://nexus--shadowxyz189.replit.app/search/yts?q=${encodeURIComponent(text)}&key=${apikey}`;
    
    const { data: response } = await axios.get(searchUrl);
    if (!response.status || !response.data?.results?.length) {
      throw new Error('No se encontraron resultados en YouTube.');
    }

    // Tomamos hasta 20 resultados (o los que devuelva la API)[span_1](start_span)[span_1](end_span)
    let videos = response.data.results.slice(0, 20);

    let txt = videos.map((v, i) => 
`*[${i+1}] ${v.title}*[span_2](start_span)[span_2](end_span)
> Canal: ${v.channel.name}[span_3](start_span)[span_3](end_span)
> Duración: ${v.duration}[span_4](start_span)[span_4](end_span)
> Fecha: ${v.published}[span_5](start_span)[span_5](end_span)
> Link: ${v.url}`).join("\n\n")[span_6](start_span)[span_6](end_span);

    await conn.sendMessage(m.chat, { 
      image: { url: videos[0].thumbnail },[span_7](start_span)[span_7](end_span)
      caption: txt 
    }, { quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    m.reply(`> ✿︎ Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> *[Error: ${e.message}]*`);
  }
};

handler.help = ['ytsearch *« ǫᴜᴇʀʏ »*'];
handler.tags = ['search'];
handler.command = ['yts', 'ytsearch'];

export default handler;
