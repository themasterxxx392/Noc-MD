import fetch from 'node-fetch'

const handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return conn.reply(m.key.remoteJid, `⚠️ Por favor, ingresa el título o el enlace de lo que deseas buscar en YouTube.\n\nEjemplo:\n*${usedPrefix + command} Takagi san*`, m)
  }

  const query = args.join(' ')
  await m.reply('⏳ Buscando y procesando tu audio, por favor espera un momento...')

  try {
    // Usamos el endpoint de Evogb beta para YouTube Play
    const apiUrl = `https://api.evogb.org/beta/dl/youtube/play?query=${encodeURIComponent(query)}`
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      throw new Error(`Error en la API: ${response.statusText}`)
    }

    const json = await response.json()

    // Verificamos la estructura de respuesta de la API de Evogb
    if (!json || (!json.resultado && !json.data && !json.url)) {
      return m.reply('❌ No se encontró ningún resultado o la API no devolvió un enlace válido.')
    }

    // Adaptamos según el JSON exacto que devuelva el endpoint (url directa o buffer)
    const audioUrl = json.resultado?.download || json.data?.url || json.url || json.resultado
    const title = json.resultado?.title || json.title || 'Audio de YouTube'
    const duration = json.resultado?.duration || json.duration || ''

    if (!audioUrl) {
      return m.reply('❌ Ocurrió un error al extraer el enlace de descarga de la API.')
    }

    let txt = `✨ *• YOUTUBE PLAY •*\n\n`
    txt += `• *Título:* ${title}\n`
    if (duration) txt += `• *Duración:* ${duration}\n`
    txt += `\n🎧 Enviando archivo de audio...`

    await conn.reply(m.key.remoteJid, txt, m)

    // Enviamos el archivo de audio usando la URL obtenida de Evogb
    await conn.sendMessage(m.key.remoteJid, {
      audio: { url: audioUrl },
      mimetype: 'audio/mp4',
      fileName: `${title}.mp3`,
      ptt: false // Cambia a true si quieres que se mande como nota de voz
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
