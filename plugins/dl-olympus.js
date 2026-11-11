import { execSync } from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';

const CONCURRENCY = 6;

async function loadPdfLib() {
    try {
        const pdfLib = await import('pdf-lib');
        return pdfLib.PDFDocument;
    } catch {
        console.log('⚙️ Instalando pdf-lib...');
        execSync('npm install pdf-lib', { stdio: 'inherit' });
        const pdfLib = await import('pdf-lib');
        return pdfLib.PDFDocument;
    }
}

async function loadSharp() {
    try {
        const sharpModule = await import('sharp');
        return sharpModule.default;
    } catch {
        console.log('⚙️ Instalando sharp...');
        execSync('npm install sharp', { stdio: 'inherit' });
        const sharpModule = await import('sharp');
        return sharpModule.default;
    }
}

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://olympusxyz.com/'
};

async function getChapterData(url, chapterNumber) {
    let targetUrl = url;

    if (targetUrl.includes('/series/') && !targetUrl.includes('/capitulo/')) {
        targetUrl = targetUrl.replace(/\/+$/, '');
        const { data: html } = await axios.get(targetUrl, { headers: HEADERS, timeout: 30000 });
        const $ = cheerio.load(html);

        let foundChapterUrl = null;
        
        $('a').each((_, el) => {
            const href = $(el).attr('href') || '';
            const text = $(el).text().trim();
            
            if (href.includes('/capitulo/')) {
                const matchNum = text.match(new RegExp(`^${chapterNumber}$`, 'i')) || href.match(new RegExp(`[/-]${chapterNumber}$`));
                if (matchNum || text.includes(`Capítulo ${chapterNumber}`) || text.includes(`Cap ${chapterNumber}`)) {
                    foundChapterUrl = href;
                }
            }
        });

        if (!foundChapterUrl) {
            $('a').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (href.match(new RegExp(`/capitulo/${chapterNumber}(?:/|$)`))) {
                    foundChapterUrl = href;
                }
            });
        }

        if (!foundChapterUrl) {
            foundChapterUrl = `${targetUrl}/capitulo/${chapterNumber}`;
        }

        targetUrl = foundChapterUrl.startsWith('http') ? foundChapterUrl : `https://olympusxyz.com${foundChapterUrl}`;
    }

    const { data: html } = await axios.get(targetUrl, { headers: HEADERS, timeout: 30000 });
    const $ = cheerio.load(html);

    let title = 'Olympus Manga';
    const pageTitleTag = $('title').first().text() || '';
    const titleMatch = pageTitleTag.match(/Cap[ií]tulo\s+(\d+(?:\.\d+)?)\s+de\s+(.+?)\s*\|\s*Olympus/i) || pageTitleTag.match(/(.+?)\s*-\s*Capitulo/i);
    if (titleMatch) {
        title = `${titleMatch[2] ? titleMatch[2].trim() : titleMatch[1].trim()} - Capítulo ${chapterNumber}`;
    } else if (pageTitleTag) {
        title = pageTitleTag.replace(/\s*\|\s*Olympus.*$/, '').trim();
    }

    let imageUrls = [];
    
    const dataPageAttr = $('#app').attr('data-page');
    if (dataPageAttr) {
        try {
            const parsed = JSON.parse(dataPageAttr);
            const chapter = parsed.props?.chapter || parsed.props?.chapterData;
            const pages = chapter?.pages || chapter?.images || parsed.props?.pages;
            if (Array.isArray(pages)) {
                imageUrls = pages.map(p => {
                    if (typeof p === 'string') return p;
                    return p.url || p.page || p.path || p.src || p.link;
                });
            }
        } catch (e) {
            console.error('Error parseando JSON del capítulo:', e.message);
        }
    }

    if (imageUrls.length === 0) {
        $('img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (src && !src.includes('logo') && !src.includes('avatar') && !src.includes('cover') && !src.includes('icon')) {
                imageUrls.push(src);
            }
        });
    }

    const cleanUrls = imageUrls.map(img => {
        if (!img) return null;
        if (img.startsWith('//')) return 'https:' + img;
        if (img.startsWith('/')) return 'https://olympusxyz.com' + img;
        return img;
    }).filter(Boolean);

    return { title, images: cleanUrls };
}

async function fetchImageBuffer(url, sharp) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
    const rawBuffer = Buffer.from(res.data);
    
    // Convertimos cualquier formato (WebP, PNG, etc.) a JPG puro sin alterar escala ni nitidez
    const jpgBuffer = await sharp(rawBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
        
    return jpgBuffer;
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < items.length) {
            const current = nextIndex++;
            try {
                results[current] = await mapper(items[current], current);
            } catch (err) {
                console.error(`Error procesando página ${current + 1}:`, err.message);
                results[current] = null;
            }
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

let handler = async (m, { conn, args, command }) => {
    if (!args[0]) {
        return m.reply(`❌ *Ingresa un enlace de la serie o del capítulo en Olympus.*\n\n📌 Ejemplo: .${command} https://olympusxyz.com/series/nombre-serie 1`);
    }

    const url = args[0];
    if (!url.includes('olympus')) {
        return m.reply('❌ URL no válida de Olympus.');
    }

    const chapterArg = args[1] ? args[1].trim() : undefined;

    if (url.includes('/series/') && !url.includes('/capitulo/') && !chapterArg) {
        return m.reply(`⚠️ *Falta el número del capítulo.*\n\n📌 *Ejemplo:* .${command} ${url} 1`);
    }

    let targetChapterNumber = chapterArg;
    if (url.includes('/capitulo/')) {
        const matchCap = url.match(/\/capitulo\/(\d+(?:\.\d+)?)/);
        if (matchCap) targetChapterNumber = matchCap[1];
    }

    if (!targetChapterNumber || !/^\d+(\.\d+)?$/.test(targetChapterNumber)) {
        return m.reply('❌ Debes especificar un número de capítulo válido (ej: 1 o 13).');
    }

    try {
        const [PDFDocument, sharp] = await Promise.all([loadPdfLib(), loadSharp()]);
        
        await m.reply(`🔍 Buscando capítulo *${targetChapterNumber}*... Esto puede tomar unos segundos.`);
        
        const { title, images } = await getChapterData(url, targetChapterNumber);

        if (!images || images.length === 0) {
            return m.reply('❌ No se encontraron imágenes en el capítulo. Verifica que el número de capítulo exista.');
        }

        await m.reply(`📸 *${title}*\nDescargando y convirtiendo *${images.length}* imágenes...`);

        const rawBuffers = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => fetchImageBuffer(imgUrl, sharp));
        const validBuffers = rawBuffers.filter(Boolean);

        const totalBytes = validBuffers.reduce((acc, buf) => acc + buf.length, 0);
        const totalMb = totalBytes / (1024 * 1024);

        const pdfDoc = await PDFDocument.create();
        let successCount = 0;

        for (const buffer of validBuffers) {
            if (!buffer) continue;
            
            try {
                const image = await pdfDoc.embedJpg(buffer);
                const page = pdfDoc.addPage([image.width, image.height]);
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
                successCount++;
            } catch (e) {
                console.error('Error insertando imagen en PDF:', e.message);
            }
        }

        if (successCount === 0) {
            return m.reply('❌ No se pudo procesar ninguna página del capítulo.');
        }

        const pdfBytes = await pdfDoc.save();
        const safeFileName = title.replace(/[^a-zA-Z0-9_-]/g, '_');

        return await conn.sendMessage(m.chat, {
            document: Buffer.from(pdfBytes),
            mimetype: 'application/pdf',
            fileName: `${safeFileName}.pdf`,
            caption: `📖 *${title}*\n📂 *Páginas:* ${successCount}\n📊 *Peso:* ${totalMb.toFixed(1)} MB\n🌐 *Fuente:* Olympus`
        }, { quoted: m });

    } catch (error) {
        console.error(error);
        m.reply(`❌ Ocurrió un error: ${error.message || error}`);
    }
};

handler.command = ['olympus'];
export default handler;
