import axios from 'axios'

const API_BASE = 'https://hikariapi.skyultraweb.com'
const API_KEY = 'hk_live_iIxT8_V9a6AMxTG5EDEoOxOFPOr-AOV5ZHoMwhZtlXU'
const MAX_SIZE_BYTES = 1024 * 1024 * 1024

const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `✿ Ingresa un enlace de YouTube.\n\n*Ejemplo:* \`${usedPrefix + command} https://www.youtube.com/watch?v=xxxxxxxxxxx\``, m)
    }

    const input = text.trim()
    if (!/youtu\.?be/i.test(input)) {
        return conn.reply(m.chat, '⚠️ El enlace ingresado no parece ser un enlace válido de YouTube.', m)
    }

    const lockKey = `${m.chat}:${input}`
    if (activeDownloads.has(lockKey)) return
    activeDownloads.add(lockKey)
    const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
        let resolveRes
        try {
            resolveRes = await axios.get(`${API_BASE}/api/scrapers/youtube/video`, {
                params: { url: input, quality: '480p' },
                headers: {
                    'x-api-key': API_KEY,
                    'Authorization': `Bearer ${API_KEY}`,
                    'Accept': 'application/json'
                },
                timeout: 30000
            })
        } catch (err) {
            throw new Error(`[paso 1/2: resolver video] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const payload = resolveRes.data
        const info = payload?.data

        if (!payload?.success || !info?.url) {
            throw new Error('[paso 1/2] La API no devolvió un link de descarga.')
        }

        // Limpiamos el nombre: quitamos paréntesis de calidad y también el guion con el canal (ej. " - Spreen Plus")
        let rawFileName = info.filename || 'video.mp4'
        let cleanFileName = rawFileName
            .replace(/\s*\([^)]*\)/g, '')        // Quita (480p, h264)
            .replace(/\s*-\s*[^.-]+(?=\.[^.]+دى*$)/i, '') // Quita el " - NombreDelCanal" antes de la extensión
            .replace(/\s*-\s*[^.-]+(?=\.mp4$)/i, '')     // Asegura quitar el guion y el canal antes de .mp4
            .trim()

        // Si por alguna razón queda feo, intentamos cortar antes del primer guion si viene estructurado como "Título - Canal"
        if (cleanFileName.includes(' - ')) {
            cleanFileName = cleanFileName.split(' - ')[0].trim()
        }

        if (!/\.[a-z0-9]{2,4}$/i.test(cleanFileName)) cleanFileName += '.mp4'

        let fileResponse
        try {
            fileResponse = await axios.get(info.url, {
                responseType: 'arraybuffer',
                headers: { 'x-api-key': API_KEY },
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

        const mimetype = fileResponse.headers['content-type'] || 'video/mp4'

        // Texto con título limpio, calidad devuelta y peso
        let txt = `> *Titulo:* ${cleanFileName}\n` +
                  `> *Calidad:* 480p\n` +
                  `> *Peso:* ${formatMB(buffer.length)} MB`

        await conn.sendMessage(m.chat, {
            document: buffer,
            fileName: cleanFileName,
            caption: txt,
            mimetype
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

    } catch (e) {
        console.error('Error en ytmp4v2:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar la descarga.\n> *[Detalle: ${e.message}]*`, m)
    } finally {
        clearTimeout(lockTimeout)
        activeDownloads.delete(lockKey)
    }
}

handler.help = ['ytmp4 <enlace>']
handler.tags = ['downloader']
handler.command = ['ytmp4']

export default handler
