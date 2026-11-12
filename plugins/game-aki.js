import axios from 'axios'

const API_BASE = 'https://api.omegatech.app/api/Fun/Akinator'

const activeSessions = new Map()
const SESSION_TTL_MS = 5 * 60 * 1000

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const userKey = m.sender
    const args = text ? text.trim().toLowerCase() : ''

    if (args === 'stop' || args === 'salir' || args === 'terminar') {
        if (activeSessions.has(userKey)) {
            clearTimeout(activeSessions.get(userKey).timeout)
            activeSessions.delete(userKey)
            return conn.reply(m.chat, '✿ Has terminado la partida de Akinator.', m)
        }
        return conn.reply(m.chat, '✿ No tienes ninguna partida activa de Akinator.', m)
    }

    if (!activeSessions.has(userKey)) {
        await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

        try {
            const { data: res } = await axios.get(API_BASE, {
                params: {
                    action: 'start',
                    lang: 'es',
                    theme: 'character',
                    useProxy: 'true'
                },
                headers: { 'Accept': 'application/json' },
                timeout: 30000
            })

            if (!res?.success || !res?.data) {
                throw new Error('La API no pudo iniciar el juego.')
            }

            const gameData = res.data

            const timeoutObj = setTimeout(() => {
                activeSessions.delete(userKey)
            }, SESSION_TTL_MS)

            activeSessions.set(userKey, {
                gameId: gameData.gameId,
                step: gameData.step,
                timeout: timeoutObj
            })

            let choicesText = Array.isArray(gameData.choices) ? gameData.choices.map(c => `> *${c.id}* › ${c.label}`).join('\n') : ''
            let txt = `✰ ᩧ　𓈒　ׄ　𝖀𝕶 𝖄 𝕬𝖐𝖎𝖓𝖆𝖙𝖔𝖗　ׅ　✿\n\n` +
                      `> *Pregunta #${gameData.questionNumber || 1}* (${gameData.progression || 0}%)\n\n` +
                      `💬 *${gameData.question}*\n\n` +
                      `${choicesText}\n\n` +
                      `_Responde con el número de tu opción (Ej: ${usedPrefix + command} 0) o escribe ${usedPrefix + command} stop para salir._`

            await conn.reply(m.chat, txt, m)
            await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

        } catch (e) {
            console.error('Error al iniciar Akinator:', e.message)
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, `> ✿︎ Ocurrió un error al iniciar Akinator.\n> *[Detalle: ${e.message}]*`, m)
        }
    } else {
        const session = activeSessions.get(userKey)

        if (!/^\d+$/.test(args)) {
            return conn.reply(m.chat, `✿ Por favor, ingresa el número de tu respuesta (Ej: \`${usedPrefix + command} 0\`) o escribe \`${usedPrefix + command} stop\` para terminar.`, m)
        }

        const answerId = parseInt(args, 10)
        if (answerId < 0 || answerId > 4) {
            return conn.reply(m.chat, '✿ Opción inválida. Elige un número del 0 al 4 según las opciones.', m)
        }

        clearTimeout(session.timeout)
        await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

        try {
            const { data: res } = await axios.get(API_BASE, {
                params: {
                    action: 'answer',
                    gameId: session.gameId,
                    step: session.step,
                    answer: answerId,
                    lang: 'es',
                    theme: 'character',
                    useProxy: 'true'
                },
                headers: { 'Accept': 'application/json' },
                timeout: 30000
            })

            if (!res?.success || !res?.data) {
                throw new Error('Error al procesar la respuesta en la API.')
            }

            const gameData = res.data

            // Verificamos si ya adivino el personaje o si la API manda la lista de resultados/answers
            if (gameData.completion === true || (Array.isArray(gameData.answers) && gameData.answers.length > 0)) {
                activeSessions.delete(userKey)

                let char = gameData.answers && gameData.answers.length > 0 ? gameData.answers[0] : null
                let txt = `✰ ᩧ　𓈒　ׄ　𝖀𝕶 𝖄 𝕬𝖐𝖎𝖓𝖆𝖙𝖔𝖗　ׅ　✿\n\n` +
                          `🎉 ¡Creo que ya sé quién es!\n\n` +
                          (char ? `> *Personaje:* ${char.name || char.absolute_name}\n> *Descripción:* ${char.description || char.comment}\n\n` : '') +
                          `_¡Partida finalizada con éxito!_`

                let imageUrl = char?.absolute_picture_path || char?.picture_path
                if (imageUrl) {
                    await conn.sendMessage(m.chat, { image: { url: imageUrl }, caption: txt }, { quoted: m })
                } else {
                    await conn.reply(m.chat, txt, m)
                }

                await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })
                return
            }

            session.step = gameData.step
            session.timeout = setTimeout(() => {
                activeSessions.delete(userKey)
            }, SESSION_TTL_MS)
            activeSessions.set(userKey, session)

            let choicesText = Array.isArray(gameData.choices) ? gameData.choices.map(c => `> *${c.id}* › ${c.label}`).join('\n') : ''
            let txt = `✰ ᩧ　𓈒　ׄ　𝖀𝕶 𝖄 𝕬𝖐𝖎𝖓𝖆𝖙𝖔𝖗　ׅ　✿\n\n` +
                      `> *Pregunta #${gameData.questionNumber}* (${gameData.progression}%)\n\n` +
                      `💬 *${gameData.question}*\n\n` +
                      `${choicesText}`

            await conn.reply(m.chat, txt, m)
            await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

        } catch (e) {
            console.error('Error en turno de Akinator:', e.message)
            activeSessions.delete(userKey)
            await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
            return conn.reply(m.chat, `> ✿︎ Ocurrió un error en la partida.\n> *[Detalle: ${e.message}]*`, m)
        }
    }
}

handler.help = ['akinator']
handler.tags = ['game']
handler.command = ['akinator', 'aki']

export default handler
