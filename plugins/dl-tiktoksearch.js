import axios from 'axios';

let handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return m.reply(`*ꕥ Por favor, ingresa un término de búsqueda o el enlace de TikTok.*\n\n*Ejemplo:* \`${usedPrefix + command} xd\``);
  }

  const text = args.join(' ');
  const isUrl = /tiktok\.com|vt\.tiktok\.com/i.test(text);
  const apikey = 'YUME_30c75365cf5d8687';

  try {
    await m.reply('➪ Procesando contenido de TikTok...');

    if (isUrl) {
      const apiUrl = `https://nexus--shadowxyz189.replit.app/download/tiktok?url=${encodeURIComponent(text)}&key=${apikey}`;
      const { data: response } = await axios.get(apiUrl);
      if (!response.status || !response.data) throw new Error('Enlace inválido o sin contenido descargable.');

      const d = response.data;
      const stats = d.stats || {};
      const authorName = d.author?.name || d.author?.nickname || 'N/A';
      const authorUser = d.author?.username || 'N/A';

      const cap = `    *乂 TIKTOK - INFO 乂*

   *｡ Título ›* ${d.title || 'Sin título'}
   *｡ Autor ›* ${authorName} (@${authorUser})
   *｡ Tipo ›* ${d.type || 'N/A'}
   *｡ Duración ›* ${d.duration || 'N/A'}
   *｡ Tamaño ›* ${d.size || 'N/A'}
   *｡ Región ›* ${d.region || 'N/A'}
   *｡ Fecha ›* ${d.date || 'N/A'}

   *｡ Likes ›* ${stats.likes || '0'}
   *｡ Comentarios ›* ${stats.comments || '0'}
   *｡ Vistas ›* ${stats.views || '0'}
   *｡ Favoritos ›* ${stats.favorites || '0'}
   *｡ Shares ›* ${stats.shares || '0'}
   *｡ Descargas ›* ${stats.downloads || '0'}

   *｡ Audio ›* ${d.audio || 'N/A'}
   *｡ Enlace ›* ${d.link || text}`.trim();

      const videoUrl = d.media?.download || d.media?.watermark || d.watermark;
      if (!videoUrl) throw new Error('No se encontró enlace de video.');

      // Descargamos el video como buffer para evitar bloqueos de stream
      const videoBuffer = await axios.get(videoUrl, { 
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      await conn.sendMessage(m.chat, {
        video: Buffer.from(videoBuffer.data),
        caption: cap,
        mimetype: 'video/mp4'
      }, { quoted: m });

    } else {
      // BÚSQUEDA (Exactamente 10 elementos)
      const searchUrl = `https://nexus--shadowxyz189.replit.app/search/tiktok?q=${encodeURIComponent(text)}&count=10&key=${apikey}`;
      const { data: response } = await axios.get(searchUrl);
      if (!response.status || !response.data?.length) throw new Error('No se encontraron resultados.');

      const results = response.data.filter(v => v.download?.video).slice(0, 10);
      if (!results.length) throw new Error('No se encontraron videos válidos.');

      const makeCap = (v, i) => {
        const s = v.stats || {};
        return `*乂 TIKTOK - ${i + 1} 乂*

   *｡ Título ›* ${v.title || 'Sin título'}
   *｡ Autor ›* ${v.author?.nickname || 'N/A'} (@${v.author?.username || 'N/A'})
   *｡ Duración ›* ${v.duration || 'N/A'}
   *｡ Tamaño ›* ${v.size || 'N/A'}
   *｡ Fecha ›* ${v.date || 'N/A'}

   *｡ Likes ›* ${s.likes || '0'}
   *｡ Comentarios ›* ${s.comments || '0'}
   *｡ Vistas ›* ${s.views || '0'}
   *｡ Favoritos ›* ${s.favorites || '0'}
   *｡ Shares ›* ${s.shares || '0'}

   *｡ Música ›* ${v.music?.title || 'N/A'}
   *｡ Enlace ›* ${v.url || 'N/A'}`;
      };

      // Envío secuencial de los 10 videos usando buffer seguro
      for (let i = 0; i < results.length; i++) {
        try {
          const videoBuffer = await axios.get(results[i].download.video, { 
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
          });

          await conn.sendMessage(m.chat, {
            video: Buffer.from(videoBuffer.data),
            caption: makeCap(results[i], i),
            mimetype: 'video/mp4'
          }, { quoted: m });

        } catch (err) {
          console.error(`Error al procesar el video ${i + 1}:`, err.message);
        }

        if (i < results.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500)); // Pausa de 1.5s entre cada video
        }
      }
    }

  } catch (e) {
    m.reply(`> ✿︎ Ocurrió un error al ejecutar el comando *${usedPrefix + command}*.\n> *[Error: ${e.message}]*`);
  }
};

handler.help = ['tiktok', 'tt', 'tiktoksearch'];
handler.tags = ['download', 'search'];
handler.command = ['tiktok', 'tt', 'tiktoks', 'tts', 'tiktoksearch', 'ttsearch', 'tiksearch'];
handler.group = true;

export default handler;
