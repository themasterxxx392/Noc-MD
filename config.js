import { watchFile, unwatchFile } from 'fs'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import fs from 'fs'

//owner
global.owner = [
['51972409783'],
['51987812968'],
['51922902497'],
]

//Información 
globalThis.info = {
wm: "Rem Bot",
vs: "2.0.5",
packname: "𝗦𝗧𝗜𝗖𝗞𝗘𝗥𝗦❤️‍🔥 - Rem",
author: "Owner: 𝑷𝒍𝒂𝒕𝒂𝒏𝒊𝒕𝒐 ᩥ᪵⃞🍌｡•",
apis: "https://api.delirius.store",
img2: "https://telegra.ph/file/39fb047cdf23c790e0146.jpg",
img4: fs.readFileSync('./media/Menu2.jpg'),
yt: "",
tiktok: "",
md: "https://github.com/themasterxxx392/YukiBot-MD",
fb: "",
ig: "",
nn: "", //Grupo ofc1
nn2: "", //Grupo ofc2
nn3: "", //Colab 
nn4: "", //Enlace Bot
nn5: "", 
nn6: "", 
nna: "",
nna2: "",
}

//----------------------------------------------------

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  import(`${file}?update=${Date.now()}`)
})
