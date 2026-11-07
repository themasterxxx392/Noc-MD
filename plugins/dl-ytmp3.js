import axios from 'axios'

const API_BASE = 'https://hikariapi.skyultraweb.com'
const API_KEY = 'hk_live_iIxT8_V9a6AMxTG5EDEoOxOFPOr-AOV5ZHoMwhZtlXU'
const MAX_SIZE_BYTES = 1024 * 1024 * 1024
const activeDownloads = new Set()
const LOCK_TTL_MS = 5 * 60 * 1000

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `✿ Ingresa un enlace de YouTube para descargar el audio.\n\n*Ejemplo:* \`${usedPrefix + command} https://www.youtube.com/watch?v=xxxxxxxxxxx\``, m)
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
            resolveRes = await axios.get(`${API_BASE}/api/scrapers/youtube/audio`, {
                params: { url: input, quality: '128k' },
                headers: {
                    'x-api-key': API_KEY,
                    'Authorization': `Bearer ${API_KEY}`,
                    'Accept': 'application/json'
                },
                timeout: 60000 // Aumentado a 60 segundos de espera
            })
        } catch (err) {
            throw new Error(`[paso 1/2: resolver audio] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const payload = resolveRes.data
        const info = payload?.response?.data || payload?.data

        if (!info?.url) {
            throw new Error('[paso 1/2] La API no devolvió un link de descarga para el audio.')
        }

        let fileName = info.filename || 'audio.mp3'
        if (!/\.[a-z0-9]{2,4}$/i.test(fileName)) fileName += '.mp3'

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
            return conn.reply(m.chat, `ꕥ El archivo de audio supera el límite permitido (${formatMB(buffer.length)}MB / Máx: ${formatMB(MAX_SIZE_BYTES)}MB).`, m)
        }

        let txt = `*[ YOUTUBE MP3 AUDIO ]*\n\n` +
                  `> *Titulo:* ${fileName}\n` +
                  `> *Calidad:* 128kbps\n` +
                  `> *Peso:* ${formatMB(buffer.length)} MB`

        await conn.sendMessage(m.chat, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName: fileName,
            caption: txt
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

    } catch (e) {
        console.error('Error en ytmp3:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el audio.\n> *[Detalle: ${e.message}]*`, m)
    } finally {
        clearTimeout(lockTimeout)
        activeDownloads.delete(lockKey)
    }
}

handler.help = ['ytmp3']
handler.tags = ['downloader']
handler.command = ['ytmp3']

export default handler
