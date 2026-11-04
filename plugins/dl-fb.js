import axios from 'axios'

const MAX_SIZE_BYTES = 1024 * 1024 * 1024 // 1GB límite de seguridad
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `✿ Ingresa un enlace de Facebook.\n\n*Ejemplo:* \`${usedPrefix + command} https://www.facebook.com/share/v/...\``, m)
    }

    const input = text.trim()
    if (!/(facebook\.com|fb\.watch)/i.test(input)) {
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
            resolveRes = await axios.get(`${global.info.nexus}/download/facebook/v2`, {
                params: { url: input, key: global.info.apikey },
                timeout: 30000
            })
        } catch (err) {
            throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const payload = resolveRes.data
        const results = payload?.result

        if (!payload?.status || !Array.isArray(results) || results.length === 0) {
            throw new Error('[paso 1/2] La API no devolvió resultados para este video de Facebook.')
        }

        // Priorizamos la calidad HD, si no está disponible usamos la primera opción (SD)
        const selectedVideo = results.find(v => v.quality === 'HD') || results[0]
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

        const qualityLabel = selectedVideo.quality || 'SD'
        let txt = `*[ FACEBOOK DOWNLOADER ]*\n\n` +
                  `> *Calidad:* ${qualityLabel}\n` +
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

handler.help = ['facebook <enlace>']
handler.tags = ['downloader']
handler.command = ['fb', 'facebook']

export default handler
