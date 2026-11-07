import axios from 'axios'
import * as cheerio from 'cheerio'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pipeline } from 'stream/promises'
import { lookup } from 'mime-types'

const MAX_SIZE = 1024 * 1024 * 1024
const TIMEOUT_MS = 20000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

const esHttp = u => /^https?:\/\//i.test(u || '')

function fetchWithTimeout(axiosConfig) {
  return axios({ ...axiosConfig, timeout: TIMEOUT_MS })
}

function safeDecode(str) {
  try {
    return decodeURIComponent(str)
  } catch {
    return str
  }
}

function buildFileName(nombre, directUrl) {
  const fromUrl = safeDecode(directUrl.split('?')[0].split('/').pop() || '')
  let name = (nombre || fromUrl || 'archivo').trim().replace(/[\\/:*?"<>|]/g, '_')

  if (!/\.[a-z0-9]{1,8}$/i.test(name)) {
    const ext = fromUrl.match(/\.([a-z0-9]{1,8})$/i)?.[1]
    name += `.${ext || 'bin'}`
  }

  return name
}

function formatBytes(bytes) {
  if (!bytes) return 'Desconocido'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

async function resolveMediafireDirect(pageUrl) {
  const { data: html } = await fetchWithTimeout({
    method: 'get',
    url: pageUrl,
    headers: { 'User-Agent': UA, Referer: 'https://www.mediafire.com/' }
  })

  const $ = cheerio.load(html)
  const boton = $('a#downloadButton')
  const scrambled = boton.attr('data-scrambled-url')

  const candidatos = [
    boton.attr('href'),
    scrambled ? Buffer.from(scrambled, 'base64').toString('utf8') : null,
    $('a.inputpopover').attr('href'),
    $('a[href*="download"][href*=".mediafire.com/"]').first().attr('href'),
    html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/)?.[0]
  ]

  const directUrl = candidatos.find(esHttp)?.replace(/&amp;/g, '&') || null

  const nombre = (
    $('.dl-btn-label').first().attr('title') ||
    $('.dl-btn-label').first().text() ||
    $('div.filename').first().text() ||
    $('meta[property="og:title"]').attr('content') ||
    ''
  ).trim() || null

  const sizeTexto = boton.text().match(/\(([\d.,]+\s*[KMGT]?B)\)/i)?.[1] || null

  return { directUrl, nombre, sizeTexto }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const fuente = text?.trim() || m.quoted?.text || ''
  const input = (fuente.match(/https?:\/\/(?:www\.)?mediafire\.com\/\S+/i) || [])[0]?.replace(/[)\]>,.]+$/, '')

  if (!input) {
    return conn.reply(m.chat, `❖ Ingresa un enlace de MediaFire.\n\n*Ejemplo:* \`${usedPrefix + command} https://www.mediafire.com/file/xxxxx/archivo.zip/file\``, m)
  }

  if (/\/folder\//i.test(input)) {
    return conn.reply(m.chat, '⚠️ Los enlaces de carpetas no están soportados, usa el enlace de un archivo.', m)
  }

  const lockKey = `${m.chat}:${input}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  let tmpPath = null

  try {
    let page
    try {
      page = await resolveMediafireDirect(input)
    } catch (err) {
      throw new Error(`[paso 1/2: leer página] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const { directUrl, nombre, sizeTexto } = page

    if (!directUrl) {
      throw new Error('[paso 1/2] No se pudo obtener el enlace directo. El archivo pudo ser eliminado o el link es inválido.')
    }

    let size = 0
    try {
      const head = await fetchWithTimeout({ method: 'head', url: directUrl, headers: { 'User-Agent': UA } })
      size = parseInt(head.headers['content-length'] || '0', 10)
    } catch {}

    if (size && size > MAX_SIZE) {
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, `ꕥ El archivo supera el límite permitido (${formatBytes(size)} / Máx: ${formatBytes(MAX_SIZE)}).`, m)
    }

    const fileName = buildFileName(nombre, directUrl)
    const mimetype = lookup(fileName) || 'application/octet-stream'

    const txt = `*[ MEDIAFIRE ]*\n\n` +
                `> *Nombre:* ${fileName}\n` +
                `> *Peso:* ${size ? formatBytes(size) : (sizeTexto || 'Desconocido')}\n` +
                `> *Tipo:* ${mimetype}\n\n` +
                `⏳ _Descargando archivo..._`

    await conn.reply(m.chat, txt, m)

    tmpPath = path.join(os.tmpdir(), `mf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${fileName}`)

    try {
      const resp = await axios.get(directUrl, {
        responseType: 'stream',
        headers: { 'User-Agent': UA, Referer: 'https://www.mediafire.com/' },
        timeout: 120000,
        maxRedirects: 5
      })

      if (String(resp.headers['content-type'] || '').includes('text/html')) {
        resp.data.destroy()
        throw new Error('El servidor devolvió una página en lugar del archivo (el enlace pudo expirar).')
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
      if (err.message === 'MAX_SIZE') throw err
      throw new Error(`[paso 2/2: descargar archivo] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const real = fs.statSync(tmpPath).size

    if (real < 100) {
      await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
      return conn.reply(m.chat, '⚠️ El servidor devolvió una respuesta inválida (puede que el link ya haya expirado). Inténtalo de nuevo.', m)
    }

    await conn.sendMessage(m.chat, {
      document: { url: tmpPath },
      fileName,
      mimetype
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en mediafire:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })

    if (e.message === 'MAX_SIZE') {
      return conn.reply(m.chat, `ꕥ El archivo supera el límite permitido (Máx: ${formatBytes(MAX_SIZE)}).`, m)
    }
    if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) {
      return conn.reply(m.chat, '⚠️ Tiempo de espera agotado al procesar el archivo.', m)
    }
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el archivo de MediaFire.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
    if (tmpPath) fs.promises.unlink(tmpPath).catch(() => {})
  }
}

handler.help = ['mediafire <enlace>']
handler.tags = ['downloader']
handler.command = ['mf', 'mediafire']

export default handler
