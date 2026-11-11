import { execSync } from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';

const CONCURRENCY = 6;
const MAX_WALK_STEPS = 600;

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

async function fetchChapterNav(url) {
    const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    const $ = cheerio.load(html);

    const titleTag = $('title').first().text() || '';
    const numMatch = titleTag.match(/Cap[ií]tulo\s+(\d+(?:\.\d+)?)/i);
    const number = numMatch ? parseFloat(numMatch[1]) : null;

    const slugMatch = url.match(/\/capitulo\/([^/?]+)/);
    const currentSlug = slugMatch ? slugMatch[1] : null;

    const toAbs = (href) => href ? (href.startsWith('http') ? href : `https://olympusxyz.com${href}`) : null;

    return {
        url,
        number,
        slug: currentSlug,
        nextUrl: toAbs($('a[title="capitulo siguiente"], a:has(span:contains("Siguiente")), a.next').attr('href')),
        prevUrl: toAbs($('a[title="capitulo anterior"], a:has(span:contains("Anterior")), a.prev').attr('href'))
    };
}

async function getChapterData(url, chapterNumber) {
    let targetUrl = url;

    // Si es la URL de la serie, construimos la ruta directa del capítulo limpiamente
    if (targetUrl.includes('/series/') && !targetUrl.includes('/capitulo/')) {
        targetUrl = targetUrl.replace(/\/+$/, '');
        targetUrl = `${targetUrl}/capitulo/${chapterNumber}`;
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

// CORTA LOS BORDES DEFECTUOSOS QUE VIENEN EN LA IMAGEN ORIGINAL
async function processImage(imageUrl, sharp) {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
    const buffer = Buffer.from(res.data);

    const img = sharp(buffer);
    const meta = await img.metadata();

    // Recortamos 8 píxeles arriba y 8 abajo para erradicar la línea incrustada de la web
    const CROP = 8; 
    let pipeline = img;

    if (meta.width && meta.height && meta.height > (CROP * 2)) {
        pipeline = pipeline.extract({
            left: 0,
            top: CROP,
            width: meta.width,
            height: meta.height - (CROP * 2)
        });
    }

    const cleanBuffer = await pipeline
        .jpeg({ quality: 92, force: true })
        .toBuffer();

    return { buffer: cleanBuffer };
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

async function listAllChapterNumbers(firstUrl, cap) {
    const numbers = [];
    let info = await fetchChapterNav(firstUrl).catch(() => null);
    let steps = 0;

    while (info && info.number !== null && steps < cap) {
        numbers.push(info.number);
        if (!info.nextUrl) break;
        info = await fetchChapterNav(info.nextUrl).catch(() => null);
        steps++;
    }

    return numbers;
}

let handler = async (m, { conn, args, command }) => {
    if (!args[0]) {
        return m.reply(`❌ *Ingresa un enlace de Olympus.*\n\n📌 Ejemplo serie + N° de capítulo: .${command} https://olympusxyz.com/series/... 13\n📌 Ver cuántos capítulos tiene: .${command} https://olympusxyz.com/series/... info`);
    }

    const url = args[0];
    if (!url.includes('olympus')) {
        return m.reply('❌ URL no válida de Olympus.');
    }

    const chapterArg = args[1] ? args[1].trim() : undefined;

    if (url.includes('/series/') && !url.includes('/capitulo/') && !chapterArg) {
        return m.reply(`⚠️ *Falta el número del capítulo.*

📌 *Ejemplo para descargar:*
.${command} ${url} 1

📌 *O si quieres ver la lista/total de capítulos:*
.${command} ${url} info`);
    }

    if (chapterArg && chapterArg.toLowerCase() === 'info') {
        try {
            const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 30000 });
            const $ = cheerio.load(html);
            const pageTitle = $('title').first().text() || '';
            const nameMatch = pageTitle.match(/^(.+?)\s*\|\s*Olympus/i);
            const seriesName = nameMatch ? nameMatch[1].trim() : 'Esta serie';
            const totalMatch = html.match(/(\d+)\s*cap[ií]tulos?\s*en\s*total/i);

            if (!totalMatch) {
                return m.reply(`❌ No se pudo determinar el total de capítulos de ${seriesName}.`);
            }
            const total = parseInt(totalMatch[1], 10);

            let firstChapterLink = null;
            $('a').each((_, el) => {
                const href = $(el).attr('href') || '';
                if (!firstChapterLink && href.includes('/capitulo/')) {
                    firstChapterLink = href;
                }
            });

            let listText = '';
            if (firstChapterLink) {
                if (total > 30) {
                    await m.reply('⏳ Son varios capítulos, esto puede tardar un poco...');
                }
                const firstChapterUrl = firstChapterLink.startsWith('http') ? firstChapterLink : `https://olympusxyz.com${firstChapterLink}`;
                const numbers = await listAllChapterNumbers(firstChapterUrl, total + 10);
                if (numbers.length > 0) {
                    listText = `\n\n${numbers.join(', ')}`;
                }
            }

            return m.reply(`📚 *${seriesName}* tiene *${total}* capítulos en total.${listText}`);
        } catch (error) {
            console.error(error);
            return m.reply(`❌ Ocurrió un error: ${error.message || error}`);
        }
    }

    let targetChapterNumber = chapterArg;
    if (url.includes('/capitulo/')) {
        const matchCap = url.match(/\/capitulo\/(\d+(?:\.\d+)?)/);
        if (matchCap) targetChapterNumber = matchCap[1];
    }

    if (!targetChapterNumber || !/^\d+(\.\d+)?$/.test(targetChapterNumber)) {
        return m.reply('❌ El número de capítulo debe ser un número válido (ej: 13 o 61.05).');
    }

    try {
        const [PDFDocument, sharp] = await Promise.all([loadPdfLib(), loadSharp()]);
        
        await m.reply(`🔍 Buscando capítulo *${targetChapterNumber}*... Esto puede tomar unos segundos.`);
        
        const { title, images } = await getChapterData(url, targetChapterNumber);

        if (!images || images.length === 0) {
            return m.reply('❌ No se encontraron imágenes en el capítulo.');
        }

        await m.reply(`📸 *${title}*\nProcesando *${images.length}* páginas...`);

        const processed = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => processImage(imgUrl, sharp));

        const pdfDoc = await PDFDocument.create();
        let successCount = 0;

        for (const result of processed) {
            if (!result) continue;
            const img = await pdfDoc.embedJpg(result.buffer);

            const page = pdfDoc.addPage([img.width, img.height]);
            page.drawImage(img, {
                x: 0,
                y: 0,
                width: img.width,
                height: img.height
            });
            successCount++;
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
            caption: `📖 *${title}*\n📂 *Páginas:* ${successCount}\n🌐 *Fuente:* Olympus`
        }, { quoted: m });

    } catch (error) {
        console.error(error);
        m.reply(`❌ Ocurrió un error: ${error.message || error}`);
    }
};

handler.command = ['olympus'];
export default handler;
