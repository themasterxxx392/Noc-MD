import axios from 'axios';
import * as cheerio from 'cheerio';

let handler = async (m, { conn, command, text, usedPrefix }) => {
    if (!text || !text.includes('yourupload.com')) {
        return m.reply(`⚠️ Debes ingresar un enlace válido de YourUpload.\n\nEjemplo:\n*${usedPrefix}${command} https://www.yourupload.com/watch/0iGIU5gILMJm*`);
    }

    try {
        await m.reply('⏳ Extrayendo video de YourUpload...');

        // 1. Extraer ID del video si está presente en la URL
        const matchId = text.match(/yourupload\.com\/(?:watch|embed|download)\/([A-Za-z0-9]+)/i);
        const id = matchId ? matchId[1] : null;

        const urlsToTry = [];
        if (id) {
            urlsToTry.push(`https://www.yourupload.com/embed/${id}`);
            urlsToTry.push(`https://www.yourupload.com/watch/${id}`);
        }
        urlsToTry.push(text.trim());

        let videoUrl = null;

        // 2. Buscar el enlace directo del mp4 en el código HTML
        for (const targetUrl of urlsToTry) {
            try {
                const { data } = await axios.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.yourupload.com/'
                    }
                });

                const $ = cheerio.load(data);

                // Opción A: Meta etiqueta og:video
                const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:src"]').attr('content');
                if (ogVideo) {
                    videoUrl = ogVideo;
                    break;
                }

                // Opción B: Etiqueta <source>
                const sourceSrc = $('source').attr('src');
                if (sourceSrc) {
                    videoUrl = sourceSrc;
                    break;
                }

                // Opción C: Buscar la variable "file:" o URL .mp4 en los scripts de la página
                const fileMatch = data.match(/file\s*:\s*["'](?<url>https?:\/\/[^"']+)["']/i) ||
                                  data.match(/(https?:\/\/[^"']+\.yourupload\.com\/noview\/[^"']+)/i) ||
                                  data.match(/(https?:\/\/[^"']+\.yourupload\.com\/[^"']+\.mp4[^"']*)/i);

                if (fileMatch) {
                    videoUrl = fileMatch.groups?.url || fileMatch[1];
                    if (videoUrl) break;
                }
            } catch (e) {
                console.error('Error al intentar extraer de:', targetUrl, e.message);
            }
        }

        if (!videoUrl) {
            return m.reply('❌ No se pudo obtener el enlace directo del video en YourUpload.');
        }

        // Formatear URL relativa a absoluta si es necesario
        if (videoUrl.startsWith('//')) {
            videoUrl = 'https:' + videoUrl;
        } else if (videoUrl.startsWith('/')) {
            videoUrl = 'https://www.yourupload.com' + videoUrl;
        }

        await m.reply('📥 Descargando archivo de video...');

        // 3. Descargar el archivo con los headers necesarios
        const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://www.yourupload.com/'
            }
        });

        const videoBuffer = Buffer.from(videoResponse.data);

        await m.reply('🚀 Enviando video a WhatsApp...');

        // 4. Enviar a WhatsApp
        try {
            return await conn.sendMessage(m.chat, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption: '🎬 *Video descargado de YourUpload*'
            }, { quoted: m });
        } catch (e) {
            return await conn.sendMessage(m.chat, {
                document: videoBuffer,
                mimetype: 'video/mp4',
                fileName: 'YourUpload_Video.mp4',
                caption: '🎬 *Video descargado de YourUpload*'
            }, { quoted: m });
        }

    } catch (error) {
        console.error('Error en comando YourUpload:', error);
        return m.reply('❌ Ocurrió un error al procesar o descargar el video de YourUpload.');
    }
};

handler.command = ['dl', 'yourupload'];

export default handler;
