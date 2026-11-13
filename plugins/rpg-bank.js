const handler = async (m, { conn, command, args }) => {
const res = await m.db.query('SELECT money, banco FROM usuarios WHERE id = $1', [m.sender])
const user = res.rows[0]
const money = user.money ?? 0
const banco = user.banco ?? 0

if (command === 'dep' || command === 'depositar') {
if (!args[0]) return m.reply(`[ ⚠️ ] *Ingresa la cantidad para agregar a tu cuenta bancaria*`)

if (/all/i.test(args[0])) {
if (money < 1) return m.reply(`*Estás pobre, no tienes LoliCoins 🪙*`)
await m.db.query(`UPDATE usuarios SET money = 0, banco = banco + $1 WHERE id = $2`, [money, m.sender])
return m.reply(`*[ 🏦 ] Has agregado ${money} LoliCoins al Banco.*`)
}

if (isNaN(args[0])) return m.reply(`[ ⚠️ ] *Falta un número válido de LoliCoins 🪙*`)
const amount = parseInt(args[0])
if (amount < 1) return m.reply(`❌ El mínimo es 1 LoliCoin.`)
if (money < amount) return m.reply(`*Che, no sabes cuánto tienes en tu cartera? Usa el comando:* #bal`)

await m.db.query(`UPDATE usuarios SET money = money - $1, banco = banco + $1 WHERE id = $2`, [amount, m.sender])
return m.reply(`*[ 🏦 ] Has ingresado ${amount} LoliCoins al Banco*`)
}

if (command === 'retirar' || command === 'toremove') {
if (!args[0]) return m.reply(`[ ⚠️ ] *Ingresa la cantidad a retirar*`)

if (/all/i.test(args[0])) {
if (banco < 1) return m.reply(`Hey fantasma 👻, no tienes nada en el banco 🥲`)
await m.db.query(`UPDATE usuarios SET banco = 0, money = money + $1 WHERE id = $2`, [banco, m.sender])
return m.reply(`*[ 🏦 ] Retiraste ${banco} LoliCoins 🪙 del Banco.*`)
}

if (isNaN(args[0])) return m.reply(`La cantidad debe ser un número válido.`)
const amount = parseInt(args[0])
if (amount < 1) return m.reply(`❌ El mínimo es 1 LoliCoin.`)
if (banco < amount) return m.reply(`*Che, no sabes cuánto tienes en tu cuenta? Usa el comando:* #bal`)

await m.db.query(`UPDATE usuarios SET banco = banco - $1, money = money + $1 WHERE id = $2`, [amount, m.sender])
return m.reply(`*[ 🏦 ] Has retirado ${amount} LoliCoins del Banco*`)
}}
handler.help = ['dep', 'depositar', 'retirar', 'toremove']
handler.tags = ['econ']
handler.command = /^(dep|depositar|retirar|toremove)$/i

export default handler
