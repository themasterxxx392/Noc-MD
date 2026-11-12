import axios from 'axios'

let handler = async (m, { conn, usedPrefix, command }) => {
  console.log('>>> EL COMANDO WAIFU HA SIDO EJECUTADO <<<')
  
  const base = global.info?.evogb || 'https://api.evogb.org'
  const key = global.info?.evogbkey || 'evogb-TyswGrUB'

  try {
    console.log('Haciendo petición a la API...')
    const { data: res } = await axios.get(`${base}/sfw/rnd/v2`, {
      headers: {
        'x-api-key': key,
        'Accept': 'application/json'
      },
      params: {
        type: 'waifu'
      },
      responseType: 'json',
      timeout: 30000
    })

    console.log('Respuesta recibida de la API:', JSON.stringify(res))

    const imageUrl = res?.data?.url || res?.data?.result || res?.url || res?.result || (typeof res === 'string' ? res : null)

    if (!imageUrl) {
      throw new Error('No se encontró la URL de la imagen en la respuesta.')
    }

    console.log('Descargando imagen desde:', imageUrl)
    const { data: imageBuffer } = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    })

    console.log('Enviando imagen al chat...')
    await conn.sendMessage(m.chat, { image: Buffer.from(imageBuffer) }, { quoted: m })
    console.log('¡Imagen enviada con éxito!')

  } catch (e) {
    console.error('ERROR ATRAPADO EN WAIFU:', e.message)
    if (e.response) {
      console.error('Datos del error HTTP:', e.response.status, e.response.data)
    }
    await conn.reply(m.chat, `> ✿ Error: ${e.message}`, m)
  }
}

handler.help = ['waifu']
handler.tags = ['anime']
handler.command = ['waifu']

export default handler
