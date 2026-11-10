import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'

const MAX_SIZE = 1024 * 1024 * 1024
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

const ES_LINK = /^https?:\/\/(www\.)?xvideos\d*\.(com|es)\/video/i

const recortar = (txt = '', max = 70) => {
  const t = String(txt).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2)

const recorrer = (obj, ruta = [], salida = []) => {
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)) salida.push({ ruta: ruta.join('.').toLowerCase(), url: obj })
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) recorrer(v, [...ruta, k], salida)
  }
  return salida
}

const buscarTitulo = (obj) => {
  if (!obj || typeof obj !== 'object') return null
  if (typeof obj.title === 'string') return obj.title
  for (const v of Object.values(obj)) {
    const t = buscarTitulo(v)
    if (t) return t
  }
  return null
}

const elegirVideo = (res, original) => {
  const todos = recorrer(res).filter(c => c.url !== original && !/\.(jpe?g|png|webp|gif|m3u8)(\?|$)/i.test(c.url) && !/thumb|cover|image|poster/.test(c.ruta))
  const mp4 = todos.filter(c => /\.mp4(\?|$)/i.test(c.url))
  const lista = mp4.length ? mp4 : todos.filter(c => /download|high|low|hd|sd|video|dl/.test(c.ruta))
  const puntaje = c => /high|hd|alta/.test(c.ruta) ? 2 : /low|sd|baja/.test(c.ruta) ? 1 : 1.5
  return lista.sort((a, b) => puntaje(b) - puntaje(a))[0]?.url || null
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb
  const input = text?.trim()

  if (!input) {
    return conn.reply(m.chat, `Ingresa lo que deseas buscar en XVideos.`, m)
  }

  const primero = input.split(/\s+/)[0]

  if (!ES_LINK.test(primero)) {
    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
      const { data: res } = await axios.get(`${base}/nsfw/search/xvideos`, {
        params: { key, query: input },
        timeout: 30000
      })

      const lista = (Array.isArray(res?.resultados) ? res.resultados : [])
        .filter(v => v?.url)
        .slice(0, 10)

      if (!res?.status || !lista.length) {
        throw new Error('No se encontraron resultados.')
      }

      let txt = ''
      lista.forEach((v, i) => {
        let duracion = v.duration ? String(v.duration).replace(/min/gi, ' min').replace(/\s+/g, ' ').trim() : '-'

        txt += `*[${i + 1}] ${recortar(v.title)}*\n`
        txt += `> ${duracion} | ${v.artist || 'Desconocido'}\n`
        txt += `> \`${v.url}\`\n\n`
      })
      txt += `> _Usa \`${usedPrefix + command} <link>\` para descargar._`

      await conn.reply(m.chat, txt, m)
      await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
    } catch (e) {
      console.error('Error en xvideos (búsqueda):', e.message)
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `> ✿︎ Ocurrió un error al buscar.\n> *[Detalle: ${e.message}]*`, m)
    }
    return
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
      const r = await axios.get(`${base}/nsfw/dl/xvideos`, {
        params: { key, url: primero },
        timeout: 60000
      })
      res = r.data
    } catch (err) {
      throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const fileUrl = elegirVideo(res, primero)
    const titulo = buscarTitulo(res)

    if (!fileUrl) {
      console.error('[xvideos] respuesta inesperada de la API:', JSON.stringify(res).slice(0, 800))
      throw new Error('[paso 1/2] La API no devolvió el video.')
    }

    const nombreArchivo = (String(titulo || 'video').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'video') + '.mp4'

    tmpPath = path.join(os.tmpdir(), `xvideos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`)

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
      document: { url: tmpPath },
      mimetype: 'video/mp4',
      fileName: nombreArchivo
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en xvideos (descarga):', e.message)
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

handler.help = ['xvideos']
handler.tags = ['nsfw']
handler.command = ['xvideos']

export default handler
