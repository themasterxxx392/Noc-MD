const FB_REGEX = /^(https?:\/\/)?(www\.|m\.|web\.|mbasic\.)?(facebook\.com|fb\.watch|fb\.com)\/\S+/i

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
    // La URL base y la key viven en config.js (globalThis.info), no en el código
    const base = globalThis.info?.evogb
    const key = globalThis.info?.evogbkey
    if (!base || !key) {
        return m.reply('⚠️ Falta configurar *evogb* y *evogbkey* en config.js')
    }

    // Acepta el link como argumento o respondiendo a un mensaje que lo contenga
    let url = (args[0] || '').trim()
    if (!url && m.quoted?.text) {
        url = (m.quoted.text.match(/https?:\/\/\S+/) || [''])[0]
    }

    if (!url) {
        return m.reply(`✦ Uso: *${usedPrefix + command} <link de Facebook>*\n\nEjemplo:\n${usedPrefix + command} https://www.facebook.com/share/r/xxxxxxxx/`)
    }
    if (!FB_REGEX.test(url)) {
        return m.reply('❌ Ese link no parece ser de Facebook.')
    }

    await m.react('🕒')

    try {
        const api = `${base}/dl/facebook?key=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`
        const res = await fetch(api)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()

        if (!json?.status || !Array.isArray(json.resultados)) {
            throw new Error('Respuesta inválida de la API')
        }

        // Solo opciones de video con link real (se descarta el audio "320kbps" y urls vacías como "/")
        const videos = json.resultados
            .filter(r => /(\d+)p/i.test(r.quality || '') && /^https?:\/\//i.test(r.url || ''))
            .map(r => ({
                height: parseInt(r.quality.match(/(\d+)p/i)[1]),
                quality: r.quality,
                url: r.url.replace(/&amp;/g, '&')
            }))
            .sort((a, b) => b.height - a.height)

        if (!videos.length) throw new Error('No se encontró ningún video')

        // Prefiere hasta 720p (más liviano para WhatsApp); si no hay, usa la menor disponible
        const elegido = videos.find(v => v.height <= 720) || videos[videos.length - 1]

        await conn.sendMessage(m.chat, {
            video: { url: elegido.url },
            mimetype: 'video/mp4',
            caption: `✅ *Facebook Downloader*\n\n✧ Calidad » *${elegido.quality}*`
        }, { quoted: m })

        await m.react('✔️')
    } catch (e) {
        console.error('[FB]', e)
        await m.react('✖️')
        return m.reply('❌ No pude descargar el video. Verifica que el link sea público e inténtalo de nuevo.')
    }
}

handler.help = ['fb <link>', 'facebook <link>']
handler.tags = ['downloader']
handler.command = ['fb', 'facebook', 'fbdl']

export default handler
