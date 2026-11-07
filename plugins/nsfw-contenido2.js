import axios from 'axios'

const captions = {      
  anal: (from, to) => from === to ? 'se la metió en el ano.' : 'se la metió en el ano a.. ',
  cum: (from, to) => from === to ? 'se vino dentro de... Omitiremos eso.' : 'se vino dentro de',
  undress: (from, to) => from === to ? 'se está quitando la ropa' : 'le está quitando la ropa a',
  fuck: (from, to) => from === to ? 'se entrega al deseo' : 'se está cogiendo a',
  spank: (from, to) => from === to ? 'está dando una nalgada' : 'le está dando una nalgada a',
  lickpussy: (from, to) => from === to ? 'está lamiendo un coño' : 'le está lamiendo el coño a',
  fap: (from, to) => from === to ? 'se está masturbando' : 'se está masturbando pensando en',
  grope: (from, to) => from === to ? 'se lo está manoseando' : 'se lo está manoseando a',
  sixnine: (from, to) => from === to ? 'está haciendo un 69' : 'está haciendo un 69 con',
  suckboobs: (from, to) => from === to ? 'está chupando unas ricas tetas' : 'le está chupando las tetas a',
  grabboobs: (from, to) => from === to ? 'está agarrando unas tetas' : 'le está agarrando las tetas a',
  blowjob: (from, to) => from === to ? 'está dando una rica mamada' : 'le dio una mamada a',
  boobjob: (from, to) => from === to ? 'esta haciendo una rusa' : 'le está haciendo una rusa a',
  footjob: (from, to) => from === to ? 'está haciendo una paja con los pies' : 'le está haciendo una paja con los pies a',
  yuri: (from, to) => from === to ? 'está haciendo tijeras!' : 'hizo tijeras con',
  cummouth: (from, to) => from === to ? 'está llenando la boca de alguien con cariño' : 'está llenando la boca de',
  cumshot: (from, to) => from === to ? 'se la metió a alguien y ahora viene el regalo' : 'le dio un regalo sorpresa a',
  handjob: (from, to) => from === to ? 'le da una paja a alguien con cariño' : 'le está haciendo una paja a',
  lickass: (from, to) => from === to ? 'saborea un culo sin detenerse' : 'le está lamiendo el culo a',
  lickdick: (from, to) => from === to ? 'chupa con ganas un pene' : 'se la mete todo en la boca para',
  fingering: (from, to) => from === to ? 'se está metiendo los dedos' : 'le está metiendo los dedos a',
  creampie: (from, to) => from === to ? 'terminó dentro sin avisar...' : 'terminó dentro de',
  facesitting: (from, to) => from === to ? 'está sentándose en una cara' : 'se sentó en la cara de',
  deepthroat: (from, to) => from === to ? 'se la traga hasta el fondo' : 'le está haciendo una garganta profunda a',
  thighjob: (from, to) => from === to ? 'está frotando entre los muslos' : 'le está haciendo una entre piernas a',
  bondage: (from, to) => from === to ? 'está atado y sin escapatoria...' : 'ató bien amarrado a',
  pegging: (from, to) => from === to ? 'está recibiendo lo que no esperaba' : 'le está dando por detrás a',
  bukkake: (from, to) => from === to ? 'terminó solo... de una forma muy especial' : 'invitó a sus amigos a acabar encima de',
  orgy: (from, to) => from === to ? 'está en una orgía' : 'organizó una orgía con',
  squirting: (from, to) => from === to ? 'llegó al límite y se vino con todo' : 'la llevó al límite hasta que se vino con todo'
}

const symbols = ['(⁠◠⁠‿⁠◕⁠)', '˃͈◡˂͈', '૮(˶ᵔᵕᵔ˶)ა', '(づ｡◕‿‿◕｡)づ', '(✿◡‿◡)', '(꒪⌓꒪)', '(✿✪‿✪｡)', '(*≧ω≦)', '(✧ω◕)', '˃ 𖥦 ˂', '(⌒‿⌒)', '(¬‿¬)', '(✧ω✧)', '✿(◕ ‿◕)✿', 'ʕ•́ᴥ•̀ʔっ', '(ㅇㅅㅇ❀)', '(∩︵∩)', '(✪ω✪)', '(✯◕‿◕✯)', '(•̀ᴗ•́)و ̑̑']

function getRandomSymbol() {
  return symbols[Math.floor(Math.random() * symbols.length)]
}

const endpointMap = {
  cummouth: 'cummoth'
}

const alias = {
  anal: ['anal'],
  cum: ['cum'],
  undress: ['undress', 'encuerar'],
  fuck: ['fuck', 'coger'],
  spank: ['spank', 'nalgada'],
  lickpussy: ['lickpussy'],
  fap: ['fap', 'paja'],
  grope: ['grope'],
  sixnine: ['sixnine', '69'],
  suckboobs: ['suckboobs'],
  grabboobs: ['grabboobs'],
  blowjob: ['blowjob', 'mamada'],
  boobjob: ['boobjob'],
  yuri: ['yuri', 'tijeras'],
  footjob: ['footjob'],
  cummouth: ['cummouth', 'cummoth'],
  cumshot: ['cumshot'],
  handjob: ['handjob'],
  lickass: ['lickass'],
  lickdick: ['lickdick'],
  fingering: ['fingering'],
  creampie: ['creampie'],
  facesitting: ['facesitting'],
  deepthroat: ['deepthroat'],
  thighjob: ['thighjob'],
  bondage: ['bondage'],
  pegging: ['pegging'],
  bukkake: ['bukkake'],
  orgy: ['orgy', 'orgia'],
  squirting: ['squirting']
}

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

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    if (global.db?.data?.chats && m.isGroup && !db.data.chats[m.chat].nsfw) {
      return m.reply(`ꕥ El contenido *NSFW* está desactivado en este grupo.\n\nUn *administrador* puede activarlo con:\n» *${usedPrefix}nsfw on*`)
    }

    const currentCommand = Object.keys(alias).find(key => alias[key].includes(command)) || command

    if (!captions[currentCommand]) {
      await m.react('✖️')
      return
    }

    const chat = m.chat
    const senderId = await resolveJid(conn, chat, m.sender)
    let rawTarget = m.mentionedJid?.[0] || m.quoted?.sender
    const targetId = rawTarget ? await resolveJid(conn, chat, rawTarget) : senderId

    const key = global.info?.evogbkey
    const base = global.info?.evogb
    const apiEndpoint = endpointMap[currentCommand] || currentCommand

    await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

    const apiUrl = `${base}/nsfw/interaction`
    const res = await axios.get(apiUrl, {
      params: { key, type: apiEndpoint },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const contentType = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status}`)
    }

    let mediaBuffer = buffer
    if (contentType.includes('json') || buffer.toString().startsWith('{')) {
      try {
        const json = JSON.parse(buffer.toString())
        const mediaUrl = json.result || json.resultado?.url || json.url
        if (!mediaUrl) throw new Error('No se encontró la URL en el JSON.')

        const mediaRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 })
        mediaBuffer = Buffer.from(mediaRes.data)
      } catch (err) {
        throw new Error(`Error al procesar el JSON: ${err.message}`)
      }
    }

    if (mediaBuffer.length < 1000) {
      throw new Error('El archivo multimedia descargado está corrupto o muy pequeño.')
    }

    const fromName = m.pushName || '@' + senderId.split('@')[0]
    const toName = '@' + targetId.split('@')[0]

    const captionText = captions[currentCommand](senderId, targetId)
    const caption = targetId !== senderId
      ? `\`${fromName}\` ${captionText} \`${toName}.\` ${getRandomSymbol()}.`
      : `\`${fromName}\` ${captionText} ${getRandomSymbol()}.`

    await conn.sendMessage(m.chat, {
      video: mediaBuffer,
      gifPlayback: true,
      caption,
      mentions: [targetId, senderId]
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error(`Error en interacción NSFW:`, e.message)
    await m.react('✖️')
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al procesar la animación.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['anal', 'cum', 'undress', 'fuck', 'spank', 'lickpussy', 'fap', 'grope', 'sixnine', 'suckboobs', 'grabboobs', 'blowjob', 'boobjob', 'yuri', 'footjob', 'cummouth', 'cumshot', 'handjob', 'lickass', 'lickdick', 'fingering', 'creampie', 'facesitting', 'deepthroat', 'thighjob', 'bondage', 'pegging', 'bukkake', 'orgy', 'squirting']
handler.tags = ['nsfw']
handler.command = ['anal', 'cum', 'undress', 'encuerar', 'fuck', 'coger', 'spank', 'nalgada', 'lickpussy', 'fap', 'paja', 'grope', 'sixnine', '69', 'suckboobs', 'grabboobs', 'blowjob', 'mamada', 'boobjob', 'yuri', 'tijeras', 'footjob', 'cummouth', 'cumshot', 'handjob', 'lickass', 'lickdick', 'fingering', 'creampie', 'facesitting', 'deepthroat', 'thighjob', 'bondage', 'pegging', 'bukkake', 'orgy', 'orgia', 'squirting']
handler.group = true

export default handler
