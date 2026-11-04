const getNum = jid => (jid || '').split('@')[0].replace(/\D/g, '')

async function resolveJid(conn, chat, jid) {
    if (!jid || !jid.endsWith('@lid')) return jid
    try {
        const meta = await conn.groupMetadata(chat)
        const p = meta.participants.find(p => p.id === jid || p.lid === jid)
        const real = [p?.phoneNumber, p?.jid, p?.id].find(x => x && x.endsWith('@s.whatsapp.net'))
        if (real) return real
    } catch {}
    return jid
}

let handler = async (m, { conn, command, text }) => {
    conn.bomba = conn.bomba || {}
    let chat = m.chat
    let g = conn.bomba[chat]
    let body = (text || m.text || '').trim()

    if (command === 'bomba') {
        if (g) return m.reply('⚠️ Ya hay un juego de bomba en curso en este chat')
        if (!m.quoted) return m.reply(`Uso: Responde al mensaje de la persona con *.bomba*`)

        let jugador1 = await resolveJid(conn, chat, m.sender)
        let jugador2 = await resolveJid(conn, chat, m.quoted.sender)

        if (jugador1 === jugador2) return m.reply('❌ No puedes jugar contigo mismo')

        conn.bomba[chat] = {
            jugador1,
            jugador2,
            raw1: m.sender,
            raw2: m.quoted.sender,
            turno: null,
            bomba: Math.floor(Math.random() * 10) + 1,
            abiertas: [],
            chat: chat,
            estado: 'esperando'
        }

        setTimeout(async () => {
            let juego = conn.bomba[chat]
            if (juego && juego.estado === 'esperando') {
                await conn.reply(chat, `⏱️ El reto de bomba expiró porque @${getNum(jugador2)} no respondió a tiempo.`, null, { mentions: [jugador2] })
                delete conn.bomba[chat]
            }
        }, 60000)

        return conn.reply(chat, `🎁 *CAJA SORPRESA EXTREMA* 💣\n\n@${getNum(jugador1)} reta a @${getNum(jugador2)}\n\nHay *10 cajas*: 1 a 10. Solo 1 tiene 💣\nQuien la abra es ELIMINADO del grupo 😈\n\n@${getNum(jugador2)} responde *.aceptar* para jugar o *.rechazar* para salvarte (Tienes 60 segundos)`, null, { mentions: [jugador1, jugador2] })
    }

    if (command === 'aceptar') {
        if (!g) return m.reply('No hay ningún reto pendiente')
        let sender = await resolveJid(conn, chat, m.sender)
        if (sender !== g.jugador2) return m.reply('No eres el retado')
        if (g.estado !== 'esperando') return

        g.estado = 'jugando'
        g.turno = Math.random() < 0.5 ? g.jugador1 : g.jugador2

        return conn.reply(chat, `✅ @${getNum(g.jugador2)} ACEPTÓ EL RETO!\n\n🎁 *CAJA SORPRESA* 💣\nCajas: .1 .2 .3 .4 .5 .6 .7 .8 .9 .10\nEmpieza @${getNum(g.turno)}\nManda el número con punto (ej. .1) para abrir una caja.`, null, { mentions: [g.jugador1, g.jugador2] })
    }

    if (command === 'rechazar') {
        if (!g) return m.reply('No hay ningún reto pendiente')
        let sender = await resolveJid(conn, chat, m.sender)
        if (sender !== g.jugador2) return m.reply('No eres el retado')

        await conn.reply(chat, `😌 @${getNum(g.jugador2)} RECHAZÓ EL RETO\nSe salvó de la bomba por ahora...`, null, { mentions: [g.jugador2] })
        delete conn.bomba[chat]
        return
    }

    if (body.startsWith('.')) {
        let num = parseInt(body.slice(1))
        if (!isNaN(num) && num >= 1 && num <= 10 && m.isGroup) {
            if (!g || g.chat !== chat || g.estado !== 'jugando') return

            let sender = await resolveJid(conn, chat, m.sender)
            if (sender !== g.turno) return conn.reply(chat, `@${getNum(sender)} No es tu turno`, null, { mentions: [sender] })
            if (g.abiertas.includes(num)) return m.reply(`La caja ${num} ya fue abierta`)

            g.abiertas.push(num)

            let esJ1 = sender === g.jugador1
            let otro = esJ1 ? g.jugador2 : g.jugador1

            if (num === g.bomba) {
                let perdedorRaw = esJ1 ? g.raw1 : g.raw2

                await conn.reply(chat, `💥 *BOOM* 💥\n\n@${getNum(sender)} ABRIÓ LA CAJA ${num} Y EXPLOTÓ! 💣\n\n@${getNum(sender)} HA SIDO ELIMINADO 😹\nGana @${getNum(otro)} 🎉`, null, { mentions: [g.jugador1, g.jugador2] })

                setTimeout(async () => {
                    try {
                        await conn.groupParticipantsUpdate(chat, [perdedorRaw], 'remove')
                    } catch (e) {
                        conn.reply(chat, `⚠️ No pude eliminar. ¿Soy admin?`)
                    }
                }, 3000)

                delete conn.bomba[chat]
                return
            }

            let restantes = 10 - g.abiertas.length
            g.turno = otro

            await conn.reply(chat, `✅ @${getNum(sender)} abrió la caja ${num}... nada! 😮‍💨\nQuedan ${restantes} cajas\nTurno de @${getNum(otro)}`, null, { mentions: [g.jugador1, g.jugador2] })

            if (g.abiertas.length === 9) {
                let perdedorRaw = esJ1 ? g.raw1 : g.raw2

                await conn.reply(chat, `🏆 Se abrieron 9 cajas y no explotó!\n@${getNum(sender)} PIERDE POR NUV👻\nGana @${getNum(otro)} 🎉`, null, { mentions: [g.jugador1, g.jugador2] })

                setTimeout(async () => {
                    try {
                        await conn.groupParticipantsUpdate(chat, [perdedorRaw], 'remove')
                    } catch (e) {
                        conn.reply(chat, `⚠️ No pude eliminar. ¿Soy admin?`)
                    }
                }, 3000)

                delete conn.bomba[chat]
            }
        }
    }
}

handler.command = ['bomba', 'aceptar', 'rechazar', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
handler.group = true
handler.botAdmin = true

export default handler
