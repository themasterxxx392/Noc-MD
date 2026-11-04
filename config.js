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
    packname: "STICKERS🔥 - Rem",
    author: "Owner: Platanito...",
    apis: "https://api.delirius.store",
    nexus: "https://nexus--shadowxyz189.replit.app",
    apikey: "YUME_30c75365cf5d8687",
    evogb: "https://api.evogb.org/beta",
    evogbkey: "evogb-TyswGrUB",
    img2: "https://telegra.ph/file/39fb047cdf23c7",
    img4: fs.readFileSync('./media/Menu2.jpg'),
    yt: "",
    tiktok: "",
    md: "https://github.com/themasterxxx392/YukiB",
    fb: "",
    ig: "",
    nn: "", //Grupo ofc1
    nn2: "", //Grupo ofc2
    nn3: "", //Colab
    nn4: "", //Enlace Bot
    nn5: "",
    nn6: "",
    nna: "",
    }

//----------------------------------------------------

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  import(`${file}?update=${Date.now()}`)
})
