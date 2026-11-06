import axios from 'axios'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const base = global.info?.evogb
  const key = global.info?.evogbkey

  if (!text) {
    return conn.reply(m.chat, `✿ Ingresa el enlace de la página web.\n\n*Ejemplo:* \`${usedPrefix + command} https://google.com\``, m)
  }

  let url = text.trim().split(/\s+/)[0]
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  try {
    new URL(url)
  } catch {
    return conn.reply(m.chat, '⚠️ El enlace ingresado no es válido.', m)
  }

  await conn.sendMessage(m.chat, { react: { text: '🕒', key: m.key } })

  try {
    const res = await axios.get(`${base}/tools/ssweb`, {
      params: { key, url, device: 'pc' },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true
    })

    const type = String(res.headers['content-type'] || '')
    const buffer = Buffer.from(res.data)

    if (res.status !== 200 || !type.startsWith('image/') || buffer.length < 1000) {
      let detalle = `HTTP ${res.status}`
      if (type.includes('json')) {
        try {
          const json = JSON.parse(buffer.toString())
          detalle = json.message || json.error || json.msg || detalle
        } catch {}
      }
      throw new Error(detalle)
    }

    await conn.sendMessage(m.chat, {
      image: buffer,
    }, { quoted: m })

    await conn.sendMessage(m.chat, { react: { text: '✔️', key: m.key } })

  } catch (e) {
    console.error('Error en ssweb:', e.message)
    await conn.sendMessage(m.chat, { react: { text: '✖️', key: m.key } })
    return conn.reply(m.chat, `> ✿︎ Ocurrió un error al capturar la página.\n> *[Detalle: ${e.message}]*`, m)
  }
}

handler.help = ['ssweb <enlace>']
handler.tags = ['tools']
handler.command = ['ss', 'ssweb']

export default handler
