import axios from 'axios'
import * as cheerio from 'cheerio'
import { lookup } from 'mime-types'

const MAX_SIZE = 1024 * 1024 * 1024
const TIMEOUT_MS = 20000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

function fetchWithTimeout(axiosConfig) {
  return axios({ ...axiosConfig, timeout: TIMEOUT_MS })
}

function buildFileName(nombre, directUrl) {
  let cleanName = nombre ? decodeURIComponent(nombre) : ''
  
  const urlClean = directUrl.split('?')[0]
  const urlExt = urlClean.split('.').pop()?.toLowerCase()
  const validExts = ['rar', 'zip', '7z', 'mp4', 'mkv', 'pdf', 'txt', 'epub', 'apk', 'exe']
  const extension = validExts.includes(urlExt) ? urlExt : 'bin'

  if (!cleanName) {
    return `archivo.${extension}`
  }

  const hasValidExtension = validExts.some(ext => cleanName.toLowerCase().endsWith(`.${ext}`))
  
  if (!hasValidExtension) {
    cleanName = `${cleanName}.${extension}`
  }

  return cleanName.trim()
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

  let directUrl =
    $('a#downloadButton').attr('href') ||
    $('a.inputpopover').attr('href') ||
    $('a[href*=".mediafire.com/"][href*="download"]').first().attr('href')

  if (!directUrl) {
    const match = html.match(/https?:\/\/download\d*\.mediafire\.com\/[^\s"'<>]+/)
    if (match) directUrl = match[0]
  }

  const nombreMatch = html.match(/class="dl-btn-label"[^>]*>([^<]+)<\/div>/) ||
                       html.match(/<div class="filename"[^>]*>([^<]+)<\/div>/)
  const nombre = nombreMatch ? nombreMatch[1].trim() : null

  return { directUrl, nombre }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text || !text.includes('mediafire.com')) {
    return m.reply(`⚠️ Debes ingresar un enlace válido de MediaFire.\n\nEjemplo:\n*${usedPrefix}${command} https://www.mediafire.com/file/xxxxx/archivo.zip/file*`)
  }

  const input = text.trim()
  const lockKey = `${m.chat}:${input}`

  if (activeDownloads.has(lockKey)) {
    return
  }
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  try {
    const { directUrl, nombre } = await resolveMediafireDirect(input)

    if (!directUrl) {
      return m.reply('❌ No se pudo obtener el enlace directo de descarga. El archivo puede haber sido eliminado o el link es inválido.')
    }

    let size = 0
    try {
      const head = await fetchWithTimeout({ method: 'head', url: directUrl, headers: { 'User-Agent': UA } })
      size = parseInt(head.headers['content-length'] || '0', 10)
    } catch (e) {}

    if (size && size > MAX_SIZE) {
      return m.reply(`❌ El archivo pesa ${formatBytes(size)}, supera el límite de ${formatBytes(MAX_SIZE)}.`)
    }

    const fileName = buildFileName(nombre, directUrl)

    await m.reply(`⏳ Descargando: \`${fileName}\`${size ? `\n*(${formatBytes(size)})*` : ''}`)

    const fileResponse = await axios.get(directUrl, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': UA, Referer: 'https://www.mediafire.com/' },
      timeout: 120000,
      maxContentLength: MAX_SIZE,
      maxBodyLength: MAX_SIZE
    })

    const buffer = Buffer.from(fileResponse.data)
    const mimetype = lookup(fileName) || fileResponse.headers['content-type'] || 'application/octet-stream'

    await conn.sendMessage(m.chat, {
      document: buffer,
      fileName,
      mimetype
    }, { quoted: m })

  } catch (error) {
    console.error('Error en comando MediaFire:', error)
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return m.reply('❌ Tiempo de espera agotado al procesar el archivo.')
    }
    if (error.message?.includes('maxContentLength') || error.message?.includes('maxBodyLength')) {
      return m.reply(`❌ El archivo supera el límite de ${formatBytes(MAX_SIZE)}.`)
    }
    return m.reply('❌ Ocurrió un error al procesar o descargar el archivo de MediaFire.')
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
  }
}

handler.command = ['mf', 'mediafire']
handler.help = ['mediafire <url>']
handler.tags = ['downloader']

export default handler
