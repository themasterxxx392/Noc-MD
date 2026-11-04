import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    try {
        let res = await axios.get(`${global.info.nexus}/reaction/nsfw/spank`, {
            params: { key: global.info.apikey },
            timeout: 30000
        })

        const json = res.data

        if (!json.status || !json.data || !json.data.dl) {
            throw new Error('La API no devolvió un enlace de video válido.')
        }

        let videoUrl = json.data.dl
        let fileName = json.data.name || 'spank.mp4'

        let txt = `*[ NSFW SPANK ]*\n\n` +
                  `> *Archivo:* ${fileName}`

        await conn.sendMessage(m.chat, { 
            video: { url: videoUrl }, 
            caption: txt,
            mimetype: 'video/mp4'
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

    } catch (e) {
        console.error('Error en spank:', e.message)
        await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el comando.\n> *[Detalle: ${e.message}]*`, m)
    }
}

handler.help = ['spank']
handler.tags = ['nsfw']
handler.command = ['spank']

export default handler
