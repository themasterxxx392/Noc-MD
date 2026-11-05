import fetch from 'node-fetch'

const handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return conn.reply(m.key.remoteJid, `⚠️ Por favor, ingresa el título o el enlace de lo que deseas buscar en YouTube.\n\nEjemplo:\n*${usedPrefix + command} Shape of You*`, m)
  }

  const query = args.join(' ')
  await m.reply('⏳ Buscando y procesando tu audio, por favor espera un momento...')

  try {
    // Usa exactamente las variables que ya tienes definidas en tu config global
    const apiUrl = `${info.evogb}/dl/youtubeplay?key=${info.evogbkey}&query=${encodeURIComponent(query)}&type=audio&quality=auto`
    
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      throw new Error(`La API no respondió correctamente (Código: ${response.status})`)
    }

    const json = await response.json()

    const audioUrl = json.resultado?.download || json.resultado?.url || json.data?.url || json.url || json.resultado
    const title = json.resultado?.title || json.title || query
    const duration = json.resultado?.duration || json.duration || ''

    if (!audioUrl) {
      return m.reply('❌ No se pudo extraer el enlace de descarga de la respuesta de la API.')
    }

    let txt = `✨ *• YOUTUBE PLAY •*\n\n`
    txt += `• *Título:* ${title}\n`
    if (duration) txt += `• *Duración:* ${duration}\n`
    txt += `\n🎧 Enviando archivo de audio...`

    await conn.reply(m.key.remoteJid, txt, m)

    await conn.sendMessage(m.key.remoteJid, {
      audio: { url: audioUrl },
      mimetype: 'audio/mp4',
      fileName: `${title}.mp3`,
      ptt: false
    }, { quoted: m })

    m.react('✅')
  } catch (error) {
    console.error('Error en comando play:', error)
    m.reply(`❌ Ocurrió un error al procesar tu solicitud:\n\n\`\`\`${error.message}\`\`\``)
    m.react('❌')
  }
}

handler.help = ['play <búsqueda>']
handler.tags = ['downloader']
handler.command = /^(play|playaudio|ytplay)$/i

export default handler
