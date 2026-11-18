import axios from 'axios'

const MAX_SIZE = 100 * 1024 * 1024
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

const ES_LINK = /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\/\S+/i

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

const formatDuracion = (seg) => {
  const s = Number(seg)
  if (!Number.isFinite(s) || s <= 0) return '-'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = Math.floor(s % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const base = global.info?.evogb
  const key = global.info?.evogbkey

  const fuente = text?.trim() || m.quoted?.text || ''
  const input = (fuente.match(/https?:\/\/\S+/) || [])[0]

  if (!input || !ES_LINK.test(input)) {
    return conn.reply(m.chat, `❖ Ingresa un enlace de YouTube.\n\n*Ejemplo:* \`${usedPrefix + command} https://youtube.com/watch?v=xxxxxxxxxxx\``, m)
  }

  const lockKey = `${m.chat}:${input}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let res
    try {
      const r = await axios.get(`${base}/dl/ytmp3`, {
        params: { key, url: input },
        timeout: 120000
      })
      res = r.data
    } catch (err) {
      throw new Error(`[paso 1/2: convertir audio] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const d = res?.data
    if (!res?.status || !d?.dl) {
      throw new Error('[paso 1/2] La API no devolvió el audio de este video.')
    }

    const txt = `*[ YOUTUBE MP3 ]*\n\n` +
                `> ❒ *Título:* ${d.title || '-'}\n` +
                `> ❒ *Duración:* ${formatDuracion(d.duration)}\n` +
                `> ❒ *Calidad:* ${d.quality || '-'}\n` +
                `> ❒ *Link:* ${input}`

    if (d.thumbnail) {
      await conn.sendMessage(m.chat, { image: { url: d.thumbnail }, caption: txt }, { quoted: m }).catch(() => conn.reply(m.chat, txt, m))
    } else {
      await conn.reply(m.chat, txt, m)
    }

    let buffer
    try {
      const f = await axios.get(d.dl, {
        responseType: 'arraybuffer',
        timeout: 300000,
        maxRedirects: 5,
        maxContentLength: MAX_SIZE,
        maxBodyLength: MAX_SIZE
      })
      buffer = Buffer.from(f.data)
    } catch (err) {
      if (/maxContentLength|maxBodyLength/i.test(err.message)) throw new Error('MAX_SIZE')
      throw new Error(`[paso 2/2: descargar audio] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    if (buffer.length < 1000) {
      throw new Error('El servidor devolvió una respuesta inválida (el enlace pudo expirar). Inténtalo de nuevo.')
    }

    const nombre = String(d.title || 'audio').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'audio'

    await conn.sendMessage(m.chat, {
      audio: buffer,
      mimetype: 'audio/mpeg',
      fileName: `${nombre}.mp3`
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en ytmp3:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })

    if (e.message === 'MAX_SIZE') {
      return conn.reply(m.chat, `ꕥ El audio supera el límite permitido (Máx: ${formatMB(MAX_SIZE)} MB).`, m)
    }
    if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) {
      return conn.reply(m.chat, '⚠️ Tiempo de espera agotado al procesar el audio.', m)
    }
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el audio.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
  }
}

handler.help = ['ytmp3']
handler.tags = ['downloader']
handler.command = ['ytmp3']

export default handler
