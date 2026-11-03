import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa un enlace de YouTube.\n\n*Ejemplo:* \`${usedPrefix + command} https://youtu.be/KvMY1uzSC1E\``, m);
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } });

  try {
    let downloadUrl = `${global.info.nexus}/download/ytdl/v2?q=${encodeURIComponent(text)}&format=mp4&quality=480&key=${global.info.apikey}`;
    
    let res = await fetch(downloadUrl);
    let json = await res.json();

    if (!json.status || !json.data || !json.data.dl) {
      throw new Error('No se pudo obtener el enlace de descarga del video.');
    }

    let videoData = json.data;
    let fileUrl = videoData.dl;
    let title = videoData.title || 'video';

    let txt = `*[ YOUTUBE MP4 DOCUMENT ]*\n\n` +
              `> *Titulo:* ${title}\n` +
              `> *Calidad:* 480p`;

    await conn.sendMessage(m.chat, { 
      document: { url: fileUrl }, 
      fileName: `${title}.mp4`,
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

handler.help = ['ytmp4 <enlace>'];
handler.tags = ['downloader'];
handler.command = ['ytmp4'];

export default handler;
