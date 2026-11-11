import fs from 'fs'
import path from 'path'

const RAIZ = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys')

const listar = (dir, salida = []) => {
  if (!fs.existsSync(dir)) return salida
  for (const nombre of fs.readdirSync(dir)) {
    const ruta = path.join(dir, nombre)
    if (fs.statSync(ruta).isDirectory()) listar(ruta, salida)
    else if (/\.(js|mjs|cjs)$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

let handler = async (m) => {
  if (!fs.existsSync(RAIZ)) {
    return m.reply('⚠️ No encontré la carpeta de Baileys en node_modules.')
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'))
  const lib = path.join(RAIZ, 'lib')
  const archivos = [...listar(path.join(lib, 'Utils')), ...listar(path.join(lib, 'Socket'))]

  const buscar = (claves) => archivos
    .filter(f => {
      const t = fs.readFileSync(f, 'utf8')
      return claves.some(k => t.includes(k))
    })
    .map(f => path.relative(RAIZ, f))

  const pack = buscar(['stickerPack', 'sticker-pack'])
  const album = buscar(['albumMessage', 'album'])

  let txt = `❖ *Baileys:* ${pkg.name} ${pkg.version}\n\n`
  txt += `❒ *Sticker pack:* ${pack.length ? '✅ aparece en el código' : '❌ no aparece en el código'}\n`
  if (pack.length) txt += pack.slice(0, 6).map(f => `> ${f}`).join('\n') + '\n'
  txt += `\n❒ *Álbum nativo:* ${album.length ? '✅ aparece en el código' : '❌ no aparece en el código'}\n`
  if (album.length) txt += album.slice(0, 4).map(f => `> ${f}`).join('\n') + '\n'

  return m.reply(txt.trim())
}

handler.help = ['checkbaileys']
handler.tags = ['owner']
handler.command = ['checkbaileys']
handler.owner = true

export default handler
