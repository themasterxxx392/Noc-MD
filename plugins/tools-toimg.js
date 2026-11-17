import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { tmpdir } from 'os';

let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = q.mimetype || '';
    
    if (!mime || !mime.includes('webp')) {
        return m.reply(`Responde a un sticker para convertirlo en imagen, Usa *${usedPrefix + command}*`);
    }

    try {
        let media = await q.download();
        let tmpInput = path.join(tmpdir(), `${Date.now()}.webp`);
        let tmpOutput = path.join(tmpdir(), `${Date.now()}.png`);

        await fs.promises.writeFile(tmpInput, media);

        await new Promise((resolve, reject) => {
            spawn('ffmpeg', ['-i', tmpInput, tmpOutput])
                .on('close', resolve)
                .on('error', reject);
        });

        let buffer = await fs.promises.readFile(tmpOutput);
        await conn.sendMessage(m.chat, { image: buffer }, { quoted: m });

        await fs.promises.unlink(tmpInput).catch(() => {});
        await fs.promises.unlink(tmpOutput).catch(() => {});

    } catch (e) {
        console.error(e);
        await m.reply(`No se pudo convertir el sticker a imagen`);
    }
};

handler.help = ['toimg'];
handler.tags = ['tools'];
handler.command = ['toimg'];

export default handler;
