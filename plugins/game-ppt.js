const getNum = jid => jid.split('@')[0].replace(/\D/g, '')

let handler = async (m, { conn, command, text }) => {
    conn.bomba = conn.bomba || {}
    let chat = m.chat
    let g = conn.bomba[chat]
    let body = (text || m.text || '').trim()

    if (command === 'bomba') {
        if (g) return m.reply('⚠️ Ya hay un juego de bomba en curso en este chat')

        let rival = null
        if (m.quoted) rival = m.quoted.sender
        else return m.reply(`Uso: Responde al mensaje de la persona con *.bomba*`)

        if (rival === m.sender) return m.reply('❌ No puedes jugar contigo mismo')

        conn.bomba[chat] = {
            jugador1: m.sender,
            jugador2: rival,
            j1num: getNum(m.sender),
            j2num: getNum(rival),
            turno: null,
            bomba: Math.floor(Math.random() * 10) + 1,
            abiertas: [],
            chat: chat,
            estado: 'esperando'
        }

        setTimeout(async () => {
            let juego = conn.bomba[chat]
            if (juego && juego.estado === 'esperando') {
                await conn.reply(chat, `⏱️ El reto de bomba expiró porque @${getNum(rival)} no respondió a tiempo.`, null, { mentions: [rival] })
                delete conn.bomba[chat]
            }
        }, 60000)

        return conn.reply(chat, `🎁 *CAJA SORPRESA EXTREMA* 💣\n\n@${getNum(m.sender)} reta a @${getNum(rival)}\n\nHay *10 cajas*: 1 a 10. Solo 1 tiene 💣\nQuien la abra es ELIMINADO del grupo 😈\n\n@${getNum(rival)} responde *.aceptar* para jugar o *.rechazar* para salvarte (Tienes 60 segundos)`, null, { mentions: [m.sender, rival] })
    }

    if (command === 'aceptar') {
        if (!g) return m.reply('No hay ningún reto pendiente')
        if (m.sender !== g.jugador2) return m.reply('No eres el retado')
        if (g.estado !== 'esperando') return

        g.estado = 'jugando'
        
        // Sorteo secreto 50/50 interno
        let empiezaElUno = Math.random() < 0.5
        g.turno = empiezaElUno ? g.j1num : g.j2num

        return conn.reply(chat, `✅ @${getNum(g.jugador2)} ACEPTÓ EL RETO!\n\n🎁 *CAJA SORPRESA* 💣\nCajas: .1 .2 .3 .4 .5 .6 .7 .8 .9 .10\nEmpieza @${g.turno}\nManda el número con punto (ej. .1) para abrir una caja.`, null, { mentions: [g.jugador1, g.jugador2] })
    }

    if (command === 'rechazar') {
        if (!g) return m.reply('No hay ningún reto pendiente')
        if (m.sender !== g.jugador2) return m.reply('No eres el retado')

        await conn.reply(chat, `😌 @${getNum(g.jugador2)} RECHAZÓ EL RETO\nSe salvó de la bomba por ahora...`, null, { mentions: [g.jugador2] })
        delete conn.bomba[chat]
        return
    }

    // Detectar números con punto (ej. .1, .2 ... .10)
    if (body.startsWith('.')) {
        let num = parseInt(body.slice(1))
        if (!isNaN(num) && num >= 1 && num <= 10 && m.isGroup) {
            if (!g || g.chat !== chat || g.estado !== 'jugando') return

            let sn = getNum(m.sender)
            if (sn !== g.turno) return m.reply(`@${sn} No es tu turno`, null, { mentions: [m.sender] })
            if (g.abiertas.includes(num)) return m.reply(`La caja ${num} ya fue abierta`)

            g.abiertas.push(num)

            if (num === g.bomba) {
                let perdedor = m.sender
                let ganador = sn === g.j1num ? g.jugador2 : g.jugador1

                await conn.reply(chat, `💥 *BOOM* 💥\n\n@${sn} ABRIÓ LA CAJA ${num} Y EXPLOTÓ! 💣\n\n@${getNum(perdedor)} HA SIDO ELIMINADO 😹\nGana @${getNum(ganador)} 🎉`, null, { mentions: [m.sender, g.jugador1, g.jugador2] })

                setTimeout(async () => {
                    try {
                        await conn.groupParticipantsUpdate(chat, [perdedor], 'remove')
                    } catch (e) {
                        conn.reply(chat, `⚠️ No pude eliminar. ¿Soy admin?`)
                    }
                }, 3000)

                delete conn.bomba[chat]
                return
            }

            let restantes = 10 - g.abiertas.length
            let siguienteTurno = sn === g.j1num ? g.j2num : g.j1num
            await conn.reply(chat, `✅ @${sn} abrió la caja ${num}... nada! 😮‍💨\nQuedan ${restantes} cajas\nTurno de @${siguienteTurno}`, null, { mentions: [m.sender, g.jugador1, g.jugador2] })

            g.turno = siguienteTurno

            if (g.abiertas.length === 9) {
                let ganador = sn === g.j1num ? g.jugador2 : g.jugador1
                let perdedor = sn === g.j1num ? g.jugador1 : g.jugador2

                await conn.reply(chat, `🏆 Se abrieron 9 cajas y no explotó!\n@${getNum(perdedor)} PIERDE POR NUV👻\nGana @${getNum(ganador)} 🎉`, null, { mentions: [g.jugador1, g.jugador2] })

                setTimeout(async () => {
                    try {
                        await conn.groupParticipantsUpdate(chat, [perdedor], 'remove')
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
