import axios from 'axios'

const LANGS = {
  es: 'Español', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán',
  it: 'Italiano', ja: 'Japonés', ko: 'Coreano', zh: 'Chino', ru: 'Ruso',
  ar: 'Árabe', hi: 'Hindi', tr: 'Turco', id: 'Indonesio', nl: 'Neerlandés',
  pl: 'Polaco', sv: 'Sueco', vi: 'Vietnamita', th: 'Tailandés', uk: 'Ucraniano',
  la: 'Latín', el: 'Griego', he: 'Hebreo', fa: 'Persa'
}

const MAX_CHARS = 2000

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const key = global.info?.evogbkey
  const base = global.info?.evogb

  let to = 'es'
  let words = [...args]

  if (words[0] && LANGS[words[0].toLowerCase()]) {
    to = words.shift().toLowerCase()
  }

  let text = words.join(' ').trim()
  if (!text && m.quoted) {
    text = (m.quoted.text || m.quoted.caption || m.quoted.msg?.caption || '').trim()
  }

  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa el texto a traducir o responde a un mensaje.\n\n*Ejemplos:*\n\`${usedPrefix + command} Hello World\`\n\`${usedPrefix + command} en Hola mundo\`\n\n*Idiomas:* ${Object.keys(LANGS).join(', ')}`, m)
  }

  if (text.length > MAX_CHARS) {
    return conn.reply(m.chat, `⚠️ El texto es demasiado largo (${text.length}/${MAX_CHARS} caracteres).`, m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const { data: res } = await axios.get(`${base}/tools/translate`, {
      params: { key, text, to },
      timeout: 30000
    })

    const result = res?.data?.message
    if (!res?.status || !result) {
      throw new Error('La API no devolvió ninguna traducción.')
    }

    const from = res.data.detected_lang || '?'
    const fromName = LANGS[from] || from.toUpperCase()
    const toName = LANGS[res.data.target_lang] || LANGS[to]

    const txt = `*[ TRADUCTOR ]*\n\n` +
                `> *Detectado:* ${fromName}\n` +
                `> *Traducido a:* ${toName}\n\n` +
                `${result}`

    await conn.reply(m.chat, txt, m)
    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en translate:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al traducir el texto.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['translate <idioma> <texto>']
handler.tags = ['tools']
handler.command = ['translate', 'traducir']

export default handler
