import fetch from 'node-fetch'

const symbols = ['(⁠◠⁠‿⁠◕⁠)', '˃͈◡˂͈', '૮(˶ᵔᵕᵔ˶)ა', '(づ｡◕‿‿◕｡)づ', '(✿◡‿◡)', '(꒪⌓꒪)', '(✿✪‿✪｡)', '(*≧ω≦)', '(✧ω◕)', '˃ 𖥦 ˂', '(⌒‿⌒)', '(¬‿¬)', '(✧ω✧)', '✿(◕ ‿◕)✿', 'ʕ•́ᴥ•̀ʔっ', '(ㅇㅅㅇ❀)', '(∩︵∩)', '(✪ω✪)', '(✯◕‿◕✯)', '(•̀ᴗ•́)و ̑̑']

function getRandomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)]
}

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    const who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
    const fromName = m.pushName || '@' + m.sender.split('@')[0]
    const toName = m.mentionedJid?.[0]
      ? '@' + (m.mentionedJid[0].split('@')[0])
      : m.quoted?.pushName || '@' + who.split('@')[0]

    const captionText = who === m.sender ? 'está dando una nalgada' : 'le está dando una nalgada a'
    const caption = who !== m.sender
      ? `\`${fromName}\` ${captionText} \`${toName}.\` ${getRandomSymbol()}.`
      : `\`${fromName}\` ${captionText} ${getRandomSymbol()}.`

    const apiUrl = `${global.info.nexus}/reaction/nsfw/spank?key=${global.info.apikey}`
    
    console.log('[SPANK API URL]:', apiUrl)

    const response = await fetch(apiUrl)
    const json = await response.json()

    if (!json.status || !json.data?.dl) {
      throw new Error('La API no devolvió un enlace de video válido.')
    }

    await conn.sendMessage(m.chat, {
      video: { url: json.data.dl },
      gifPlayback: true,
      caption,
      mentions: [who, m.sender]
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en spank:', e)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    await conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar el comando.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['spank <@usuario>']
handler.tags = ['nsfw']
handler.command = ['spank', 'nalgada']
handler.group = true

export default handler
