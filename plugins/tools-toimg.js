import { webp2png } from '../../lib/webp2png.js' // O la ruta donde tu bot maneje la conversión de webp a imagen

let handler = async (m, { conn, usedPrefix, command }) => {
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || ''

    if (!mime || !mime.includes('webp')) {
        return conn.reply(m.chat, `❖ Por favor, responde a un sticker para convertirlo en imagen.`, m)
    }

    await m.react('🕒')

    try {
        let media = await q.download()
        let out = await webp2png(media).catch(_ => null)
        
        if (!out) {
            throw new Error('No se pudo convertir el sticker a imagen.')
        }

        await conn.sendFile(m.chat, out, 'image.jpg', '', m)
        await m.react('✔️')
    } catch (e) {
        console.error('Error en toimg:', e.message)
        await m.react('✖️')
        return conn.reply(m.chat, `> ✿︎ Ocurrió un error al convertir el sticker.\n> *[Detalle: ${e.message}]*`, m)
    }
}

handler.help = ['toimg']
handler.tags = ['tools']
handler.command = ['toimg']

export default handler
