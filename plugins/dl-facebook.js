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
    
    if (!text) {
        return conn.reply(m.chat, `_✿ Ingresa un enlace de Facebook._`, m)
    }

    const input = text.trim()
    if (!/(facebook\.com|fb\.watch|fb\.com)/i.test(input)) {
        return conn.reply(m.chat, '⚠️ El enlace ingresado no parece ser un enlace válido de Facebook.', m)
    }

    const lockKey = `${m.chat}:${input}`
    if (activeDownloads.has(lockKey)) return
    activeDownloads.add(lockKey)
    const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
        let resolveRes
        try {
            resolveRes = await axios.get(`${base}/dl/facebook`, {
                params: { key, url: input },
                timeout: 30000
            })
        } catch (err) {
            throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const payload = resolveRes.data
        const results = payload?.resultados

        if (!payload?.status || !Array.isArray(results) || results.length === 0) {
            throw new Error('[paso 1/2] La API no devolvió resultados para este video de Facebook.')
        }

        const videos = results
            .filter(r => /(\d+)p/i.test(r.quality || '') && /^https?:\/\//i.test(r.url || ''))
            .map(r => ({
                height: parseInt(r.quality.match(/(\d+)p/i)[1]),
                quality: r.quality,
                url: r.url.replace(/&amp;/g, '&')
            }))
            .sort((a, b) => b.height - a.height)

        if (!videos.length) {
            throw new Error('[paso 1/2] No se encontró ninguna opción de video disponible.')
        }

        const selectedVideo = videos.find(v => v.height <= 720) || videos[videos.length - 1]
        const videoUrl = selectedVideo.url

        let fileResponse
        try {
            fileResponse = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 300000,
                maxRedirects: 5,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            })
        } catch (err) {
            throw new Error(`[paso 2/2: descargar stream] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const buffer = Buffer.from(fileResponse.data)

        if (buffer.length < 1000) {
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, '⚠️ El servidor devolvió una respuesta inválida (puede que el link ya haya expirado). Inténtalo de nuevo.', m)
        }

        if (buffer.length >= MAX_SIZE_BYTES) {
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, `ꕥ El video supera el límite permitido (${formatMB(buffer.length)}MB / Máx: ${formatMB(MAX_SIZE_BYTES)}MB).`, m)
        }

        let txt = `*[ FACEBOOK DOWNLOADER ]*\n\n` +
                  `> *Calidad:* ${selectedVideo.quality}\n` +
                  `> *Peso:* ${formatMB(buffer.length)} MB`

        await conn.sendMessage(m.chat, {
            video: buffer,
            caption: txt,
            mimetype: 'video/mp4'
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

    } catch (e) {
        console.error('Error en fbdl:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el video de Facebook.\n> *[Detalle: ${e.message}]*`, m)
    } finally {
        clearTimeout(lockTimeout)
        activeDownloads.delete(lockKey)
    }
}

handler.help = ['facebook']
handler.tags = ['downloader']
handler.command = ['fb', 'facebook']

export default handler
