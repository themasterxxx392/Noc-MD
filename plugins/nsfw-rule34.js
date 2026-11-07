import fetch from 'node-fetch'

const handler = async (m, { conn, args, usedPrefix, command }) => {
  if (!args[0]) {
    return conn.reply(m.key.remoteJid, `⚠️ Por favor, ingresa una etiqueta (tag) para buscar.\n\nEjemplo:\n*${usedPrefix + command} ellen_joe*`, m)
  }

  const tag = encodeURIComponent(args.join('_'))
  await m.reply('⏳ Buscando imagen, por favor espera un momento...')

  try {
    const apiUrl = `${info.evogb}/nsfw/rule34?tag=${tag}&type=image&key=${info.evogbkey}`
    
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(`La API no respondió correctamente (Código: ${response.status})`)
    }

    // Verificamos si la respuesta realmente es un JSON antes de parsearla
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('La API devolvió un formato inválido o la etiqueta no arrojó resultados.')
    }

    const json = await response.json()

    // Extraemos la URL de la imagen de la respuesta
    const imageUrl = json.resultado?.url || json.resultado?.image || json.url || json.resultado

    if (!imageUrl) {
      return m.reply('❌ No se encontró ninguna imagen para esa etiqueta.')
    }

    let txt = `✨ *• RULE34 •*\n\n`
    txt += `• *Tag:* ${args.join(' ')}`

    // Descargamos y enviamos la imagen como buffer
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('No se pudo descargar la imagen obtenida.')
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    await conn.sendMessage(m.key.remoteJid, {
      image: buffer,
      caption: txt
    }, { quoted: m })

    m.react('✅')
  } catch (error) {
    console.error('Error en comando rule34:', error)
    m.reply(`❌ Ocurrió un error al procesar tu solicitud:\n\n\`\`\`${error.message}\`\`\``)
    m.react('❌')
  }
}

handler.help = ['rule34 <tag>'];
handler.tags = ['nsfw'];
handler.command = ['rule34'];

export default handler
