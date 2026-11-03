import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa un enlace de YouTube.\n\n*Ejemplo:* \`${usedPrefix + command} https://youtu.be/KvMY1uzSC1E\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let downloadUrl = `${global.info.nexus}/download/ytdl?url=${encodeURIComponent(text)}&key=${global.info.apikey}`;
    
    let res = await fetch(downloadUrl);
    let json = await res.json();

    if (!json.status || !json.data) {
      throw new Error('No se pudo obtener información del video.');
    }

    let videoData = json.data;
    let videoFormats = videoData.video || [];
    
    let selectedVideo = videoFormats.find(v => v.quality === '480p') || 
                        videoFormats.find(v => v.quality === '360p' || v.quality === '720p') || 
                        videoFormats[0];

    if (!selectedVideo || !selectedVideo.url) {
      throw new Error('No se encontró un enlace de video válido.');
    }

    let txt = `*[ YOUTUBE MP4 DOCUMENT ]*\n\n` +
              `> *Titulo:* ${videoData.title}\n` +
              `> *Calidad:* ${selectedVideo.quality}\n` +
              `> *Peso:* ${selectedVideo.size_formatted || 'Desconocido'}`;

    await conn.sendMessage(m.chat, { 
      document: { url: selectedVideo.url }, 
      fileName: `${videoData.title || 'video'}.mp4`,
      caption: txt,
      mimetype: 'video/mp4'
    }, { quoted: m });

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } });

  } catch (e) {
    console.error(e);
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } });
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al descargar el video como documento.\n> *[Detalle: ${e.message}]*`, m);
  }
};

handler.help = ['ytmp4 <link>'];
handler.tags = ['downloader'];
handler.command = ['ytmp4'];

export default handler;
