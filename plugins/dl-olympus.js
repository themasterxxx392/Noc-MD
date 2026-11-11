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

    const slugMatch = url.match(/\/capitulo\/(\d+)/);
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

    // Si es un enlace de serie, armamos la URL directa del capítulo inteligentemente
    if (targetUrl.includes('/series/')) {
        // Limpiamos barras finales si las tuviera
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
    
    // Método 1: Leer desde el JSON de Inertia (#app data-page)
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

    // Método 2: Respaldo buscando etiquetas <img> directamente en el DOM
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

async function fetchImageBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
    return Buffer.from(res.data);
}

function getAdaptiveSettings(totalMb) {
    if (totalMb <= 12) {
        return { scale: 1.25, quality: 95 };
    } else if (totalMb <= 25) {
        return { scale: 1.22, quality: 94 };
    } else if (totalMb <= 45) {
        return { scale: 1.18, quality: 92 };
    } else {
        return { scale: 1.15, quality: 90 };
    }
}

async function processImage(buffer, settings, sharp) {
    const img = sharp(buffer);
    const meta = await img.metadata();

    const targetWidth = meta.width ? Math.round(meta.width * settings.scale) : null;

    let pipeline = img;
    if (targetWidth) {
        pipeline = pipeline.resize({ width: targetWidth, kernel: 'lanczos3' });
    }

    const enhancedBuffer = await pipeline
        .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.2 })
        .jpeg({ quality: settings.quality })
        .toBuffer();

    return { buffer: enhancedBuffer, isJpg: true };
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
        return m.reply(`❌ *Ingresa un enlace de la serie o del capítulo en Olympus.*\n\n📌 Ejemplo con serie: .${command} https://olympusxyz.com/series/nombre-serie 1\n📌 Ejemplo con enlace directo: .${command} https://olympusxyz.com/series/nombre-serie/capitulo/1`);
    }

    const url = args[0];
    if (!url.includes('olympus')) {
        return m.reply('❌ URL no válida de Olympus.');
    }

    const chapterArg = args[1] ? args[1].trim() : undefined;

    // Si pasaron la URL de la serie pero olvidaron poner el número del capítulo
    if (url.includes('/series/') && !url.includes('/capitulo/') && !chapterArg) {
        return m.reply(`⚠️ *Falta el número del capítulo.*

📌 *Ejemplo:*
.${command} ${url} 1`);
    }

    // Determinamos el número de capítulo final a descargar
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

        await m.reply(`📸 *${title}*\nDescargando *${images.length}* imágenes...`);

        const rawBuffers = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => fetchImageBuffer(imgUrl));
        const validBuffers = rawBuffers.filter(Boolean);

        const totalBytes = validBuffers.reduce((acc, buf) => acc + buf.length, 0);
        const totalMb = totalBytes / (1024 * 1024);

        const settings = getAdaptiveSettings(totalMb);
        const processed = await mapWithConcurrency(validBuffers, CONCURRENCY, (buf) => processImage(buf, settings, sharp));

        const pdfDoc = await PDFDocument.create();
        let successCount = 0;

        for (const result of processed) {
            if (!result) continue;
            const { buffer, isJpg } = result;
            const image = isJpg ? await pdfDoc.embedJpg(buffer) : await pdfDoc.embedPng(buffer);

            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
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
            caption: `📖 *${title}*\n📂 *Páginas:* ${successCount}\n📊 *Peso inicial:* ${totalMb.toFixed(1)} MB\n🌐 *Fuente:* Olympus`
        }, { quoted: m });

    } catch (error) {
        console.error(error);
        m.reply(`❌ Ocurrió un error: ${error.message || error}`);
    }
};

handler.command = ['olympus'];
export default handler;
