import axios from 'axios'

const MAX_SIZE_BYTES = 100 * 1024 * 1024
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const base = global.info?.evogb
  const key = global.info?.evogbkey
  if (!base || !key) {
    return conn.reply(m.chat, '⚠️ Falta configurar *evogb* y *evogbkey* en config.js', m)
  }

  if (!text?.trim()) {
    return conn.reply(m.chat, `✿ Ingresa el nombre de la canción o video.\n\n*Ejemplo:* \`${usedPrefix + command} Shape of You Ed Sheeran\``, m)
  }

  const isVideo = command === 'play2'
  const query = text.trim()

  const lockKey = `${m.chat}:${command}:${query}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let resolveRes
    try {
      resolveRes = await axios.get(`${base}/dl/youtubeplay`, {
        params: { key, query, type: isVideo ? 'video' : 'audio', quality: 'auto' },
        timeout: 60000
      })
    } catch (err) {
      throw new Error(`[paso 1/2: buscar y resolver] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const payload = resolveRes.data
    const info = payload?.data
    const fileUrl = info?.download?.url || info?.dl

    if (!payload?.status || !info || !fileUrl) {
      throw new Error('[paso 1/2] La API no devolvió resultados para esta búsqueda.')
    }

    const views = Number(info.views)
    const txt = `*[ YOUTUBE PLAY ]*\n\n` +
                `> *Título:* ${info.title}\n` +
                `> *Canal:* ${info.author?.name || 'Desconocido'}\n` +
                `> *Duración:* ${info.duration?.timestamp || '-'}\n` +
                `> *Vistas:* ${Number.isFinite(views) ? views.toLocaleString('es-PE') : '-'}\n` +
                `> *Calidad:* ${info.quality || 'auto'}\n` +
                `> *Link:* ${info.url}\n\n` +
                `⏳ _Descargando ${isVideo ? 'video' : 'audio'}..._`

    if (info.thumbnail) {
      await conn.sendMessage(m.chat, { image: { url: info.thumbnail }, caption: txt }, { quoted: m }).catch(() => conn.reply(m.chat, txt, m))
    } else {
      await conn.reply(m.chat, txt, m)
    }

    let fileResponse
    try {
      fileResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 300000,
        maxRedirects: 5,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })
    } catch (err) {
      throw new Error(`[paso 2/2: descargar archivo] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const buffer = Buffer.from(fileResponse.data)

    if (buffer.length < 1000) {
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, '⚠️ El servidor devolvió una respuesta inválida (puede que el link ya haya expirado). Inténtalo de nuevo.', m)
    }

    if (buffer.length >= MAX_SIZE_BYTES) {
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `ꕥ El archivo supera el límite permitido (${formatMB(buffer.length)}MB / Máx: ${formatMB(MAX_SIZE_BYTES)}MB).`, m)
    }

    if (isVideo) {
      await conn.sendMessage(m.chat, {
        video: buffer,
        caption: info.title,
        mimetype: 'video/mp4'
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        audio: buffer,
        mimetype: 'audio/mpeg',
        fileName: info.download?.filename || `${info.title}.mp3`
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en play:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar tu solicitud.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
  }
}

handler.help = ['play <texto>', 'play2 <texto>']
handler.tags = ['downloader']
handler.command = ['play', 'play2']

export default handler
