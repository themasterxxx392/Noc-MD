import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'

const API = 'https://api.omegatech.app/api/download/YouTube'
const MAX_SIZE = 500 * 1024 * 1024
const VIDEO_MAX = 80 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const activeDownloads = new Set()
const LOCK_TTL_MS = 5 * 60 * 1000

const ES_LINK = /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\/\S+/i

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const fuente = text?.trim() || m.quoted?.text || ''
  const input = (fuente.match(/https?:\/\/\S+/) || [])[0]

  if (!input || !ES_LINK.test(input)) {
    return conn.reply(m.chat, `❖ Ingresa un enlace de YouTube.\n\n*Ejemplos:*\n\`${usedPrefix + command} https://youtube.com/watch?v=xxxxxxxxxxx\`\n\`${usedPrefix + command} https://youtu.be/xxxxxxxxxxx 720\`\n\n> Calidades: 144, 240, 360, 480 (por defecto), 720 y 1080.`, m)
  }

  const pedida = Number((fuente.replace(input, '').match(/\b(144|240|360|480|720|1080)p?\b/) || [])[1]) || 480

  const lockKey = `${m.chat}:${input}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  let tmpPath = null

  try {
    let res
    try {
      const r = await axios.get(API, {
        params: { action: 'download', url: input, quality: pedida, type: 'video', bitrate: 128 },
        timeout: 120000
      })
      res = r.data
    } catch (err) {
      throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const d = res?.data
    if (!res?.success || !d) {
      throw new Error('[paso 1/2] La API no devolvió resultados para este video.')
    }

    const disponibles = (d.videoFormats || [])
      .filter(f => f.downloadUrl)
      .map(f => ({ height: Number(f.height), url: f.downloadUrl, size: Number(f.sizeBytes) || 0, label: f.label || `${f.height}p` }))

    if (d.video?.downloadUrl && !disponibles.some(f => f.url === d.video.downloadUrl)) {
      disponibles.push({ height: Number(d.video.quality), url: d.video.downloadUrl, size: Number(d.video.sizeBytes) || 0, label: d.video.label || `${d.video.quality}p` })
    }

    disponibles.sort((a, b) => b.height - a.height)

    if (!disponibles.length) {
      throw new Error('[paso 1/2] La API no devolvió ninguna calidad disponible.')
    }

    const dentro = disponibles.filter(f => !f.size || f.size <= MAX_SIZE)
    if (!dentro.length) throw new Error('MAX_SIZE')

    const elegido = dentro.find(f => f.height <= pedida) || dentro[dentro.length - 1]

    const txt = `*[ YOUTUBE MP4 ]*\n\n` +
                `> ❒ *Título:* ${d.title || '-'}\n` +
                `> ❒ *Canal:* ${d.channel || '-'}\n` +
                `> ❒ *Duración:* ${d.durationLabel || '-'}\n` +
                `> ❒ *Calidad:* ${elegido.label}\n` +
                `> ❒ *Peso:* ${elegido.size ? `${formatMB(elegido.size)} MB` : '-'}\n` +
                `> ❒ *Link:* ${d.url || input}\n\n` +
                `⏳ _Descargando video..._`

    if (d.thumbnail) {
      await conn.sendMessage(m.chat, { image: { url: d.thumbnail }, caption: txt }, { quoted: m }).catch(() => conn.reply(m.chat, txt, m))
    } else {
      await conn.reply(m.chat, txt, m)
    }

    tmpPath = path.join(os.tmpdir(), `ytmp4_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`)

    try {
      const resp = await axios.get(elegido.url, {
        responseType: 'stream',
        headers: { 'User-Agent': UA },
        timeout: 120000,
        maxRedirects: 5
      })

      if (String(resp.headers['content-type'] || '').includes('text/html') || String(resp.headers['content-type'] || '').includes('json')) {
        resp.data.destroy()
        throw new Error('El servidor devolvió una respuesta inválida (el enlace pudo expirar).')
      }

      if (Number(resp.headers['content-length']) > MAX_SIZE) {
        resp.data.destroy()
        throw new Error('MAX_SIZE')
      }

      let recibido = 0
      resp.data.on('data', chunk => {
        recibido += chunk.length
        if (recibido > MAX_SIZE) resp.data.destroy(new Error('MAX_SIZE'))
      })

      await pipeline(resp.data, fs.createWriteStream(tmpPath))
    } catch (err) {
      if (err.message === 'MAX_SIZE' || err.message.startsWith('El servidor')) throw err
      throw new Error(`[paso 2/2: descargar video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const real = fs.statSync(tmpPath).size
    if (real < 1000) {
      throw new Error('El servidor devolvió una respuesta inválida (el enlace pudo expirar).')
    }

    const nombre = String(d.title || 'video').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video'

    if (real <= VIDEO_MAX) {
      await conn.sendMessage(m.chat, {
        video: { url: tmpPath },
        mimetype: 'video/mp4',
        fileName: `${nombre}.mp4`
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        document: { url: tmpPath },
        mimetype: 'video/mp4',
        fileName: `${nombre}.mp4`
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en ytmp4:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })

    if (e.message === 'MAX_SIZE') {
      return conn.reply(m.chat, `ꕥ El video supera el límite permitido (Máx: ${formatMB(MAX_SIZE)} MB). Prueba con una calidad menor.`, m)
    }
    if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) {
      return conn.reply(m.chat, '⚠️ Tiempo de espera agotado al procesar el video.', m)
    }
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el video.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
    if (tmpPath) fs.promises.unlink(tmpPath).catch(() => {})
  }
}

handler.help = ['ytmp4']
handler.tags = ['downloader']
handler.command = ['ytmp4']

export default handler
