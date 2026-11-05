import fetch from 'node-fetch'

const handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return conn.reply(m.key.remoteJid, `⚠️ Por favor, ingresa el título o el enlace de lo que deseas buscar en YouTube.\n\nEjemplo:\n*${usedPrefix + command} Takagi san*`, m)
  }

  const query = args.join(' ')
  await m.reply('⏳ Buscando y procesando tu audio, por favor espera un momento...')

  try {
    // Probamos con la ruta estándar de la beta de Evogb para play/audio
    const apiUrl = `https://api.evogb.org/beta/dl/play?query=${encodeURIComponent(query)}`
    let response = await fetch(apiUrl)
    
    // Si da 404, probamos una ruta alternativa común en su API
    if (!response.ok) {
      const altUrl = `https://api.evogb.org/beta/dl/youtube?q=${encodeURIComponent(query)}`
      response = await fetch(altUrl)
    }

    if (!response.ok) {
      throw new Error(`La API no respondió correctamente (Código: ${response.status})`)
    }

    const json = await response.json()

    // Verificamos las posibles estructuras que devuelve Evogb
    const audioUrl = json.resultado?.download || json.resultado?.url || json.data?.url || json.url || json.resultado
    const title = json.resultado?.title || json.title || 'Audio de YouTube'
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
