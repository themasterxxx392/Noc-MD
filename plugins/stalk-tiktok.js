import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`⚡ *Ingresa el enlace del episodio de Vitaminagg.*\n\n*Ejemplo:* ${usedPrefix + command} https://anime.vitaminagg.vip/episodes/...`);
    }

    const targetUrl = text.trim();
    if (!targetUrl.startsWith('http')) {
        return m.reply('❌ El enlace ingresado no es válido.');
    }

    await m.react('🕒');

    try {
        const baseHeaders = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://anime.vitaminagg.vip/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        };

        const cookieMap = new Map();
        cookieMap.set('visited_post', 'true');

        const updateCookies = (headers) => {
            const setCookie = headers['set-cookie'] || headers['Set-Cookie'];
            if (setCookie) {
                const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
                for (const c of arr) {
                    const [pair] = c.split(';');
                    if (pair) {
                        const [key, ...val] = pair.split('=');
                        if (key && val.length > 0) {
                            cookieMap.set(key.trim(), val.join('=').trim());
                        }
                    }
                }
            }
        };

        const getCookieHeader = () => {
            return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
        };

        const episodeRes = await axios.get(targetUrl, {
            headers: { ...baseHeaders, 'Cookie': getCookieHeader() },
            timeout: 30000
        });
        updateCookies(episodeRes.headers);
        const episodeHtml = episodeRes.data;

        const segments = targetUrl.split('/').filter(Boolean);
        const slug = segments[segments.length - 1] || segments[segments.length - 2] || 'video';
        let fileName = `${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}.mp4`;

        const decodeHtmlEntities = (str) => str
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;|&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        const titleMatch = episodeHtml.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) {
            let cleanTitle = titleMatch[1].replace(/<\/?[^>]+(>|$)/g, '').trim();
            cleanTitle = decodeHtmlEntities(cleanTitle);
            cleanTitle = cleanTitle
                .split(/\s*[-–|]\s*/)
                .filter(part => !/vitaminagg/i.test(part))
                .join(' – ')
                .trim();
            cleanTitle = cleanTitle.replace(/[<>:"/\\|?*]/g, '').trim();
            const isJunk = !cleanTitle || cleanTitle.length < 4;
            if (!isJunk) {
                fileName = `${cleanTitle}.mp4`;
            }
        }

        const intermediateMatch = episodeHtml.match(/https?:\/\/p\.vitaminagg\.vip\/[^\s"'<>]+/i) || episodeHtml.match(/https?:\/\/[^\s"'<>]+?code=[^\s"'<>]+/i);

        if (!intermediateMatch) {
            return m.reply('⚠️ No se encontró el enlace intermedio de descarga en este episodio.');
        }

        // Limpieza estricta de la URL intermedia
        let intermediateUrl = intermediateMatch[0].replace(/&amp;/g, '&').replace(/['"<>]/g, '');

        const adRes = await axios.get(intermediateUrl, {
            headers: { ...baseHeaders, 'Referer': targetUrl, 'Cookie': getCookieHeader() },
            timeout: 30000
        });
        updateCookies(adRes.headers);
        const adHtml = adRes.data;

        // Extraer code de forma segura (desde la URL o analizando el HTML)
        let code = null;
        try {
            const urlObj = new URL(intermediateUrl);
            code = urlObj.searchParams.get('code');
        } catch (e) {}

        if (!code) {
            const codeMatch = adHtml.match(/code\s*[:=]\s*['"]([^'"]+)['"]/i) || adHtml.match(/['"]code['"]\s*:\s*['"]([^'"]+)['"]/i);
            if (codeMatch) code = codeMatch[1];
        }

        // Extraer start
        const startMatch = adHtml.match(/start\s*[:=]\s*['"]?(\d+)['"]?/i) || adHtml.match(/['"]start['"]\s*[:=]\s*['"]?(\d+)['"]?/i);
        let startVal = startMatch ? startMatch[1] : Math.floor(Date.now() / 1000);

        // Extraer token (soporta variable JS o búsqueda de hash hexadecimal de 64 caracteres)
        let tokenVal = null;
        const tokenMatch = adHtml.match(/token\s*[:=]\s*['"]([^'"]+)['"]/i) || adHtml.match(/['"]token['"]\s*[:=]\s*['"]([^'"]+)['"]/i);
        if (tokenMatch) {
            tokenVal = tokenMatch[1];
        } else {
            const hexMatch = adHtml.match(/[a-fA-F0-9]{64}/);
            if (hexMatch) tokenVal = hexMatch[0];
        }

        const tickEndpoint = 'https://p.vitaminagg.vip/tick.php';

        let rawGoUrl = null;
        let attempts = 0;
        const maxAttempts = 25;
        let lastErrorMsg = 'Ningún error';

        while (attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                const postParams = new URLSearchParams();
                postParams.append('action', 'check');
                postParams.append('code', code || '');
                postParams.append('start', startVal);
                postParams.append('token', tokenVal || '');

                const tickRes = await axios.post(tickEndpoint, postParams, {
                    headers: {
                        ...baseHeaders,
                        'Referer': intermediateUrl,
                        'Cookie': getCookieHeader(),
                        'X-Requested-With': 'XMLHttpRequest',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json, text/javascript, */*; q=0.01'
                    },
                    timeout: 5000
                });

                updateCookies(tickRes.headers);
                let data = tickRes.data;

                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        continue;
                    }
                }

                if (data) {
                    if (data.token) tokenVal = data.token;
                    if (data.start) startVal = data.start;

                    if (data.ready && (data.goUrl || data.gourl || data.url || data.link)) {
                        rawGoUrl = data.goUrl || data.gourl || data.url || data.link;
                        break;
                    }
                }
            } catch (err) {
                lastErrorMsg = err.message;
            }
        }

        if (!rawGoUrl) {
            await m.react('✖️');
            return m.reply(
                `⚠️ *Error / Tiempo agotado.*\n\n` +
                `🔍 *Diagnóstico de Extracción (POST corregido):*\n` +
                `- Code extraído: ${code}\n` +
                `- Start extraído: ${startVal}\n` +
                `- Token extraído: ${tokenVal ? tokenVal.slice(0, 15) + '...' : 'VACÍO ❌'}\n` +
                `- Último error HTTP: ${lastErrorMsg}`
            );
        }

        const videoUrl = new URL(rawGoUrl, intermediateUrl).href;

        const tmpDir = path.join(process.cwd(), 'dlcache_gojo');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const filePath = path.join(tmpDir, `Dl_${Date.now()}.mp4`);

        const videoRes = await axios.get(videoUrl, {
            responseType: 'stream',
            timeout: 600000,
            headers: {
                ...baseHeaders,
                'Referer': intermediateUrl
            },
            maxRedirects: 5
        });

        const writer = fs.createWriteStream(filePath);
        videoRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
            videoRes.data.on('error', reject);
        });

        if (!fs.existsSync(filePath)) {
            throw new Error(`El archivo descargado desapareció antes de procesarlo (${filePath}).`);
        }

        const PART_SIZE_BYTES = Math.floor(1 * 1024 * 1024 * 1024);
        const totalBytes = fs.statSync(filePath).size;

        if (totalBytes <= PART_SIZE_BYTES) {
            await conn.sendMessage(m.chat, {
                document: { url: filePath },
                mimetype: 'video/mp4',
                fileName: fileName
            }, { quoted: m });
        } else {
            const baseName = fileName.replace(/\.mp4$/i, '');
            const stamp = Date.now();
            const partPrefix = `part_${stamp}_`;
            const partPattern = path.join(tmpDir, `${partPrefix}%03d.mp4`);

            let duration;
            try {
                const { stdout } = await execFileAsync('ffprobe', [
                    '-v', 'error',
                    '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1',
                    filePath
                ]);
                duration = parseFloat(stdout.trim());
            } catch (err) {
                throw new Error(`No se pudo leer la duración del video con ffprobe: ${err.message}`);
            }

            const bytesPerSecond = totalBytes / duration;
            const segmentTimeSec = Math.max(60, Math.floor(PART_SIZE_BYTES / bytesPerSecond));

            await execFileAsync('ffmpeg', [
                '-i', filePath,
                '-c', 'copy',
                '-map', '0',
                '-f', 'segment',
                '-segment_time', String(segmentTimeSec),
                '-reset_timestamps', '1',
                '-y',
                partPattern
            ]);

            const partFiles = fs.readdirSync(tmpDir)
                .filter(f => f.startsWith(partPrefix))
                .sort();

            for (let i = 0; i < partFiles.length; i++) {
                const partPath = path.join(tmpDir, partFiles[i]);
                await conn.sendMessage(m.chat, {
                    document: { url: partPath },
                    mimetype: 'video/mp4',
                    fileName: `${baseName} - Parte ${i + 1} de${partFiles.length}.mp4`
                }, { quoted: m });

                try {
                    if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
                } catch (e) {}
            }
        }

        await m.react('✔️');

        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {}

    } catch (error) {
        console.error('Error general:', error);
        await m.react('✖️');
        return m.reply(`❌ Error general:\n\n\`\`\`${error.message}\`\`\``);
    }
};

handler.command = ["vit"];
export default handler;
