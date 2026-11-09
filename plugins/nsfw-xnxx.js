import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'

const MAX_SIZE = 1024 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

const BLOQUEADOS = ['loli', 'lolicon', 'shota', 'shotacon', 'child', 'children', 'kid', 'kids', 'toddler', 'underage', 'preteen', 'minor', 'jailbait', 'niña', 'niñas', 'niño', 'niños', 'infantil', 'menor de edad']
const REGEX_BLOQUEO = BLOQUEADOS.map(w => new RegExp(`(^|[^a-záéíóúñ0-9])${w}([^a-záéíóúñ0-9]|$)`, 'i'))
const bloqueado = (txt = '') => REGEX_BLOQUEO.some(r => r.test(String(txt)))

const ES_LINK = /^https?:\/\/(www\.)?xnxx\.(com|es|tv)\/video-/i

const recortar = (txt = '', max = 70) => {
  const t = String(txt).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb
  const input = text?.trim()

  if (!input) {
    return conn.reply(m.chat, `❖ Ingresa una búsqueda o un enlace.\n\n*Ejemplos:*\n\`${usedPrefix + command} anime\`\n\`${usedPrefix + command} https://www.xnxx.com/video-xxxxx/titulo\``, m)
  }

  const primero = input.split(/\s+/)[0]

  if (!ES_LINK.test(primero)) {
    if (bloqueado(input)) {
      return conn.reply(m.chat, '⚠️ Esa búsqueda no está permitida.', m)
    }

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
      const { data: res } = await axios.get(`${base}/nsfw/search/xnxx`, {
        params: { key, query: input },
        timeout: 30000
      })

      const lista = (Array.isArray(res?.resultados) ? res.resultados : [])
        .filter(v => v?.url && !bloqueado(v.title))
        .slice(0, 10)

      if (!res?.status || !lista.length) {
        throw new Error('No se encontraron resultados.')
      }

      let txt = `*[🔞] XNXX*\n> ❖ Búsqueda › ${recortar(input, 40)}\n\n`
      lista.forEach((v, i) => {
        txt += `*[${i + 1}] ${recortar(v.title)}*\n`
        txt += `> ❒ ${v.duration || '-'} | ${v.views || '0'} vistas | ${v.resolution || '-'}\n`
        txt += `> ➩ \`${v.url}\`\n\n`
      })
      txt += `> ✩ _Usa \`${usedPrefix + command} <link>\` para descargar._`

      await conn.reply(m.chat, txt, m)
      await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
    } catch (e) {
      console.error('Error en xnxx (búsqueda):', e.message)
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar.\n> *[Detalle: ${e.message}]*`, m)
    }
    return
  }

  if (bloqueado(primero)) {
    return conn.reply(m.chat, '⚠️ Este contenido no está permitido.', m)
  }

  const lockKey = `${m.chat}:${primero}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  let tmpPath = null

  try {
    let res
    try {
      const r = await axios.get(`${base}/nsfw/dl/xnxx`, {
        params: { key, url: primero },
        timeout: 60000
      })
      res = r.data
    } catch (err) {
      throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const info = res?.resultado?.result
    const fileUrl = info?.download?.high || info?.download?.low

    if (!res?.status || !info || !fileUrl) {
      throw new Error('[paso 1/2] La API no devolvió el video.')
    }

    if (bloqueado(info.title)) {
      throw new Error('Este contenido no está permitido.')
    }

    const duracion = String(info.duration || '').split('\n').pop().trim() || '-'

    const txt = `*[🔞] XNXX*\n\n` +
                `> ❒ *Título:* ${recortar(info.title, 100)}\n` +
                `> ❒ *Duración:* ${duracion}\n` +
                `> ❒ *Calidad:* ${info.quality || '-'}\n\n` +
                `⏳ _Descargando video..._`

    const portada = info.gallery?.default || info.gallery?.thumb
    if (portada) {
      await conn.sendMessage(m.chat, { image: { url: portada }, caption: txt }, { quoted: m }).catch(() => conn.reply(m.chat, txt, m))
    } else {
      await conn.reply(m.chat, txt, m)
    }

    tmpPath = path.join(os.tmpdir(), `xnxx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`)

    try {
      const resp = await axios.get(fileUrl, {
        responseType: 'stream',
        headers: { 'User-Agent': UA },
        timeout: 120000,
        maxRedirects: 5
      })

      if (String(resp.headers['content-type'] || '').includes('text/html')) {
        resp.data.destroy()
        throw new Error('El servidor devolvió una página en lugar del video (el enlace pudo expirar).')
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

    if (fs.statSync(tmpPath).size < 1000) {
      throw new Error('El servidor devolvió una respuesta inválida (el enlace pudo expirar).')
    }

    await conn.sendMessage(m.chat, {
      video: { url: tmpPath },
      mimetype: 'video/mp4'
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en xnxx (descarga):', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })

    if (e.message === 'MAX_SIZE') {
      return conn.reply(m.chat, `ꕥ El video supera el límite permitido (Máx: ${formatMB(MAX_SIZE)} MB).`, m)
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

handler.help = ['xnxx <búsqueda>', 'xnxx <link>']
handler.tags = ['nsfw']
handler.command = ['xnxx']

export default handler
