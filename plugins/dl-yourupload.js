import axios from 'axios'
import * as cheerio from 'cheerio'

const MAX_SIZE = 800 * 1024 * 1024
const TIMEOUT = 30000

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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.yourupload.com/'
    }

    let videoUrl = null

    for (const targetUrl of urlsToTry) {
      try {
        const { data } = await axios.get(targetUrl, {
          headers: commonHeaders,
          timeout: TIMEOUT
        })

        const $ = cheerio.load(data)

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

    if (videoUrl.startsWith('//')) {
      videoUrl = 'https:' + videoUrl
    } else if (videoUrl.startsWith('/')) {
      videoUrl = 'https://www.yourupload.com' + videoUrl
    }

    try {
      const head = await axios.head(videoUrl, { headers: commonHeaders, timeout: TIMEOUT })
      const size = parseInt(head.headers['content-length'] || '0', 10)
      if (size > MAX_SIZE) {
        return m.reply(`❌ El video pesa ${(size / 1024 / 1024).toFixed(1)}MB, supera el límite de ${MAX_SIZE / 1024 / 1024}MB.`)
      }
    } catch (e) {}

    await m.reply('⏳ Descargando...')

    const videoResponse = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      headers: commonHeaders,
      timeout: 120000,
      maxContentLength: MAX_SIZE,
      maxBodyLength: MAX_SIZE
    })

    const videoBuffer = Buffer.from(videoResponse.data)

    await conn.sendMessage(m.chat, {
      document: videoBuffer,
      mimetype: 'video/mp4',
      fileName: `YourUpload_${id}.mp4`,
      caption: '🎬 *Video descargado de YourUpload*'
    }, { quoted: m })

  } catch (error) {
    console.error('Error en comando YourUpload:', error)
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return m.reply('❌ Tiempo de espera agotado al procesar el video.')
    }
    if (error.message.includes('maxContentLength') || error.message.includes('maxBodyLength')) {
      return m.reply(`❌ El video supera el límite de ${MAX_SIZE / 1024 / 1024}MB.`)
    }
    return m.reply('❌ Ocurrió un error al procesar o descargar el video de YourUpload.')
  }
}

handler.command = ['dl', 'yourupload']
handler.help = ['yourupload <url>']
handler.tags = ['downloader']

export default handler
