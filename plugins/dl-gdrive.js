import axios from 'axios'

const MAX_SIZE_BYTES = 100 * 1024 * 1024
const activeDownloads = new Set()
const LOCK_TTL_MS = 3 * 60 * 1000

function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2)
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const base = global.info?.evogb || 'https://api.evogb.org'
    const key = global.info?.evogbkey || 'evogb-TyswGrUB'

    if (!text) {
        return conn.reply(m.chat, `✿ Ingresa un enlace de Google Drive.`, m)
    }

    const input = text.trim()
    if (!/drive\.google\.com/i.test(input)) {
        return conn.reply(m.chat, '⚠️ El enlace ingresado no parece ser un enlace válido de Google Drive.', m)
    }

    const lockKey = `${m.chat}:${input}`
    if (activeDownloads.has(lockKey)) return
    activeDownloads.add(lockKey)
    const lockTimeout = setTimeout(() => activeDownloads.delete(lockKey), LOCK_TTL_MS)

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
        let resolveRes
        try {
            resolveRes = await axios.get(`${base}/dl/google-drive`, {
                params: { key, url: input },
                timeout: 30000,
                validateStatus: () => true
            })
        } catch (err) {
            throw new Error(`[paso 1/2: resolver archivo] ${err.response ? `HTTP ${err.response.status}` : err.message}`)
        }

        const payload = resolveRes.data
        const info = payload?.data || payload

        const downloadUrl = info?.url || info?.download || (typeof payload === 'string' ? payload : null)

        if ((resolveRes.status !== 200 && resolveRes.status !== 201) || (!payload?.status && !downloadUrl)) {
            let detalle = `HTTP ${resolveRes.status}`
            if (payload && typeof payload === 'object') {
                detalle = payload.message || payload.error || payload.msg || detalle
            }
            throw new Error(`[paso 1/2] La API no devolvió un link de descarga válido. (${detalle})`)
        }

        let rawFileName = info?.filename || info?.title || 'archivo.bin'
        let cleanFileName = String(rawFileName).trim()

        let fileResponse
        try {
            fileResponse = await axios.get(downloadUrl, {
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

        if (buffer.length < 100) {
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, '⚠️ El servidor devolvió una respuesta inválida (puede que el link ya haya expirado o no sea público). Inténtalo de nuevo.', m)
        }

        if (buffer.length >= MAX_SIZE_BYTES) {
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, `ꕥ El archivo supera el límite permitido (${formatMB(buffer.length)}MB / Máx: ${formatMB(MAX_SIZE_BYTES)}MB).`, m)
        }

        const mimetype = fileResponse.headers['content-type'] || 'application/octet-stream'

        let txt = `*[ GOOGLE DRIVE DOWNLOADER ]*\n\n` +
                  `> *Nombre:* ${cleanFileName}\n` +
                  `> *Peso:* ${formatMB(buffer.length)} MB`

        await conn.sendMessage(m.chat, {
            document: buffer,
            fileName: cleanFileName,
            caption: txt,
            mimetype
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

    } catch (e) {
        console.error('Error en gdrive:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el archivo de Google Drive.\n> *[Detalle: ${e.message}]*`, m)
    } finally {
        clearTimeout(lockTimeout)
        activeDownloads.delete(lockKey)
    }
}

handler.help = ['gdrive']
handler.tags = ['downloader']
handler.command = ['gdrive']

export default handler
