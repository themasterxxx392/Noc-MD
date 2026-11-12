import axios from 'axios'
import * as baileys from '@whiskeysockets/baileys'

const { generateWAMessageFromContent, generateWAMessage } = baileys.generateWAMessage ? baileys : baileys.default

const MAX_SIZE = 100 * 1024 * 1024
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Referer': 'https://www.tiktok.com/'
}

const ES_LINK = /^https?:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\/\S+/i

const formatMB = (bytes) => (bytes / (1024 * 1024)).toFixed(2)
const num = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-PE') : '-'
const recortar = (txt = '', max = 150) => {
  const t = String(txt).replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}
const aUrl = (x) => typeof x === 'string' ? x : x?.url

async function descargar(url) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: HEADERS,
    timeout: 120000,
    maxRedirects: 5,
    maxContentLength: MAX_SIZE,
    maxBodyLength: MAX_SIZE
  })
  return Buffer.from(r.data)
}

async function enviarAlbum(conn, jid, imagenes, quoted, caption) {
  const album = generateWAMessageFromContent(jid, {
    messageContextInfo: {},
    albumMessage: {
      expectedImageCount: imagenes.length,
      expectedVideoCount: 0,
      ...(quoted ? {
        contextInfo: {
          remoteJid: quoted.key.remoteJid,
          fromMe: quoted.key.fromMe,
          stanzaId: quoted.key.id,
          participant: quoted.key.participant || quoted.key.remoteJid,
          quotedMessage: quoted.message
        }
      } : {})
    }
  }, {})

  await conn.relayMessage(album.key.remoteJid, album.message, { messageId: album.key.id })

  for (let i = 0; i < imagenes.length; i++) {
    const content = i === 0 && caption ? { image: imagenes[i], caption } : { image: imagenes[i] }
    const img = await generateWAMessage(album.key.remoteJid, content, { upload: conn.waUploadToServer })
    img.message.messageContextInfo = {
      messageAssociation: { associationType: 1, parentMessageKey: album.key }
    }
    await conn.relayMessage(img.key.remoteJid, img.message, { messageId: img.key.id })
    await new Promise(resolve => setTimeout(resolve, 300))
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const base = global.info?.evogb
  const key = global.info?.evogbkey

  const fuente = text?.trim() || m.quoted?.text || ''
  const input = (fuente.match(/https?:\/\/\S+/) || [])[0]

  if (!input || !ES_LINK.test(input)) {
    return conn.reply(m.chat, `✿ Ingresa un enlace de TikTok.`, m)
  }

  const lockKey = `${m.chat}:${input}`
  if (activeDownloads.has(lockKey)) return
  activeDownloads.add(lockKey)
  const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    let res
    try {
      const r = await axios.get(`${base}/dl/tiktok`, {
        params: { key, url: input },
        timeout: 60000
      })
      res = r.data
    } catch (err) {
      throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
    }

    const d = res?.data
    if (!res?.status || !d) {
      throw new Error('[paso 1/2] La API no devolvió resultados para este enlace.')
    }

    const autor = d.author?.nickname ? `${d.author.nickname}${d.author.unique_id ? ` (@${d.author.unique_id})` : ''}` : '-'

    const caption = `*[ TIKTOK DOWNLOADER ]*\n\n` +
                    `> ❒ *Autor:* ${autor}\n` +
                    `> ❒ *Título:* ${recortar(d.title) || '-'}\n` +
                    `> ❒ *Duración:* ${d.duration || '-'}\n` +
                    `> ❒ *Vistas:* ${num(d.stats?.plays)} | *Likes:* ${num(d.stats?.likes)}`

    const lista = Array.isArray(d.dl) ? d.dl : Array.isArray(d.images) ? d.images : null

    if (lista) {
      const urls = lista.map(aUrl).filter(Boolean).slice(0, 10)
      if (!urls.length) throw new Error('[paso 1/2] La API no devolvió las imágenes.')

      let imagenes
      try {
        imagenes = (await Promise.all(urls.map(u => descargar(u).catch(() => null)))).filter(b => b && b.length > 1000)
      } catch (err) {
        throw new Error(`[paso 2/2: descargar imágenes] ${err.message}`)
      }
      if (!imagenes.length) throw new Error('[paso 2/2] No se pudo descargar ninguna imagen.')

      if (imagenes.length === 1) {
        await conn.sendMessage(m.chat, { image: imagenes[0], caption }, { quoted: m })
      } else {
        try {
          await enviarAlbum(conn, m.chat, imagenes, m, caption)
        } catch (err) {
          console.error('Error al enviar el álbum, se envían por separado:', err.message)
          for (let i = 0; i < imagenes.length; i++) {
            await conn.sendMessage(m.chat, i === 0 ? { image: imagenes[i], caption } : { image: imagenes[i] }, { quoted: m })
            await new Promise(resolve => setTimeout(resolve, 300))
          }
        }
      }
    } else {
      if (!d.dl || typeof d.dl !== 'string') {
        throw new Error('[paso 1/2] La API no devolvió el video.')
      }

      let buffer
      try {
        buffer = await descargar(d.dl)
      } catch (err) {
        if (/maxContentLength|maxBodyLength/i.test(err.message)) throw new Error('MAX_SIZE')
        throw new Error(`[paso 2/2: descargar video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
      }

      if (buffer.length < 1000) {
        throw new Error('El servidor devolvió una respuesta inválida (el enlace pudo expirar). Inténtalo de nuevo.')
      }

      await conn.sendMessage(m.chat, {
        video: buffer,
        mimetype: 'video/mp4',
        caption
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en tiktok:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })

    if (e.message === 'MAX_SIZE') {
      return conn.reply(m.chat, `ꕥ El video supera el límite permitido (Máx: ${formatMB(MAX_SIZE)} MB).`, m)
    }
    if (e.code === 'ECONNABORTED' || /timeout/i.test(e.message)) {
      return conn.reply(m.chat, '⚠️ Tiempo de espera agotado al procesar el video.', m)
    }
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el video de TikTok.\n> *[Detalle: ${e.message}]*`, m)
  } finally {
    clearTimeout(lockTimeout)
    activeDownloads.delete(lockKey)
  }
}

handler.help = ['tiktok']
handler.tags = ['downloader']
handler.command = ['tt', 'tiktok']

export default handler
