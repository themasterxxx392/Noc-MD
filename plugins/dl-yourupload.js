import axios from 'axios'
import * as cheerio from 'cheerio'

const MAX_SIZE = 800 * 1024 * 1024
const TIMEOUT = 30000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function cleanBase(raw) {
  if (!raw) return null
  let name = raw
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(watch|download)\s+/i, '')
    .replace(/^yourupload\s*[-–|:]\s*/i, '')
    .replace(/\s*[-–|]\s*yourupload.*$/i, '')
    .replace(/\.(mp4|mkv|avi|mov|webm)$/i, '')
    .trim()
  if (!name || /^(yourupload|embed|watch|download|video)$/i.test(name)) return null
  return name
}

function nameFromDisposition(header) {
  if (!header) return null
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (star) {
    try { return decodeURIComponent(star[1]) } catch { return star[1] }
  }
  const plain = header.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain ? plain[1] : null
}

function nameFromUrl(url) {
  try {
    const last = url.split('?')[0].split('/').pop()
    if (!/\.(mp4|mkv|avi|mov|webm)$/i.test(last)) return null
    return decodeURIComponent(last)
  } catch {
    return null
  }
}

function absolutize(url) {
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) return 'https://www.yourupload.com' + url
  return url
}

let handler = async (m, { conn, command, text, usedPrefix }) => {
  if (!text || !text.includes('yourupload.com')) {
    return m.reply(`⚠️ Debes ingresar un enlace válido de YourUpload.\n\nEjemplo:\n*${usedPrefix}${command} https://www.yourupload.com/watch/0iGIU5gILMJm*`)
  }

  try {
    const matchId = text.match(/yourupload\.com\/(?:watch|embed|download)\/([A-Za-z0-9]+)/i)
    const id = matchId ? matchId[1] : null

    if (!id) {
      return m.reply('❌ No se pudo identificar el ID del video en el enlace.')
    }

    const urlsToTry = [
      `https://www.yourupload.com/embed/${id}`,
      `https://www.yourupload.com/watch/${id}`,
      text.trim()
    ]

    const commonHeaders = {
      'User-Agent': UA,
      'Referer': 'https://www.yourupload.com/'
    }

    let videoUrl = null
    let pageName = null

    for (const targetUrl of urlsToTry) {
      try {
        const { data } = await axios.get(targetUrl, {
          headers: commonHeaders,
          timeout: TIMEOUT
        })

        const $ = cheerio.load(data)

        if (!pageName) {
          pageName =
            cleanBase($('meta[property="og:title"]').attr('content')) ||
            cleanBase($('title').first().text()) ||
            cleanBase($('h1').first().text())
        }

        const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:src"]').attr('content')
        if (ogVideo) { videoUrl = ogVideo; break }

        const sourceSrc = $('source').attr('src')
        if (sourceSrc) { videoUrl = sourceSrc; break }

        const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+)["']/i) ||
                          data.match(/(https?:\/\/[^"']+\.yourupload\.com\/noview\/[^"']+)/i) ||
                          data.match(/(https?:\/\/[^"']+\.yourupload\.com\/[^"']+\.mp4[^"']*)/i)

        if (fileMatch) {
          videoUrl = fileMatch.groups?.url || fileMatch[1]
          if (videoUrl) break
        }
      } catch (e) {
        console.error('Error al intentar extraer de:', targetUrl, e.message)
      }
    }

    if (!videoUrl) {
      return m.reply('❌ No se pudo obtener el enlace directo del video en YourUpload.')
    }

    videoUrl = absolutize(videoUrl)

    let dispositionName = null

    try {
      const head = await axios.head(videoUrl, { headers: commonHeaders, timeout: TIMEOUT })
      const size = parseInt(head.headers['content-length'] || '0', 10)
      if (size > MAX_SIZE) {
        return m.reply(`❌ El video pesa ${(size / 1024 / 1024).toFixed(1)}MB, supera el límite de ${MAX_SIZE / 1024 / 1024}MB.`)
      }
      dispositionName = nameFromDisposition(head.headers['content-disposition'])
    } catch (e) {}

    const baseName =
      pageName ||
      cleanBase(dispositionName) ||
      cleanBase(nameFromUrl(videoUrl)) ||
      'Video'

    const fileName = `${baseName}.mp4`

    await m.reply('⏳ Descargando...')

    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      headers: commonHeaders,
      timeout: 120000,
      maxContentLength: MAX_SIZE,
      maxBodyLength: MAX_SIZE
    })

    const contentType = (videoResponse.headers['content-type'] || '').toLowerCase()
    if (contentType.includes('text/html')) {
      return m.reply('❌ El servidor devolvió una página en vez del video. El enlace puede haber expirado.')
    }

    const videoBuffer = Buffer.from(videoResponse.data)

    if (videoBuffer.length < 5000) {
      return m.reply('❌ El archivo descargado está vacío o es inválido.')
    }

    await conn.sendMessage(m.chat, {
      document: videoBuffer,
      mimetype: 'video/mp4',
      fileName
    }, { quoted: m })

  } catch (error) {
    console.error('Error en comando YourUpload:', error)
    const msg = error?.message || ''
    if (error.code === 'ECONNABORTED' || msg.includes('timeout')) {
      return m.reply('❌ Tiempo de espera agotado al procesar el video.')
    }
    if (msg.includes('maxContentLength') || msg.includes('maxBodyLength')) {
      return m.reply(`❌ El video supera el límite de ${MAX_SIZE / 1024 / 1024}MB.`)
    }
    return m.reply('❌ Ocurrió un error al procesar o descargar el video de YourUpload.')
  }
}

handler.command = ['yourupload']
handler.help = ['yourupload']
handler.tags = ['downloader']

export default handler
