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

    const slugMatch = url.match(/\/capitulo\/\d+\/([^/?]+)/);
    const currentSlug = slugMatch ? slugMatch[1] : null;

    const toAbs = (href) => href ? (href.startsWith('http') ? href : `https://olympusxyz.com${href}`) : null;

    return {
        url,
        number,
        slug: currentSlug,
        nextUrl: toAbs($('a[title="capitulo siguiente"]').attr('href')),
        prevUrl: toAbs($('a[title="capitulo anterior"]').attr('href'))
    };
}

function chapterMatches(actualNumber, wanted) {
    if (actualNumber === wanted) return true;
    if (Number.isInteger(wanted) && Math.floor(actualNumber) === wanted) return true;
    return false;
}

function isTargetChapter(info, targetSlug, wantedNumber) {
    if (!info || info.number === null || !info.slug) return false;
    const sameSlug = info.slug.toLowerCase().trim() === targetSlug.toLowerCase().trim();
    return sameSlug && chapterMatches(info.number, wantedNumber);
}

async function findChapterUrl(firstChapterId, targetSlug, firstNumber, firstUrl, wanted) {
    let stepGuess = 11;

    const tryId = async (id) => {
        const url = `https://olympusxyz.com/capitulo/${id}/${targetSlug}`;
        try {
            return await fetchChapterNav(url);
        } catch (e) {
            return null;
        }
    };

    let guessId = firstChapterId + Math.round((wanted - firstNumber) * stepGuess);
    console.log(`Olympus: probando capítulo ${wanted} en id ${guessId}`);
    let info = await tryId(guessId);

    if (info && !isTargetChapter(info, targetSlug, wanted)) {
        console.log(`Olympus: el id ${guessId} devolvió la serie '${info.slug}' cap ${info.number}, cancelando saltos ciegos.`);
        info = null;
    }

    if (!info) {
        console.log('Olympus: caminando secuencialmente desde el primer capítulo...');
        info = await fetchChapterNav(firstUrl).catch(() => null);
    }

    let steps = 0;
    while (info && !isTargetChapter(info, targetSlug, wanted) && steps < MAX_WALK_STEPS) {
        const stepUrl = info.number < wanted ? info.nextUrl : info.prevUrl;
        if (!stepUrl) break;
        info = await fetchChapterNav(stepUrl).catch(() => null);
        steps++;
    }

    if (!info || !isTargetChapter(info, targetSlug, wanted)) return null;

    let backSteps = 0;
    while (info.prevUrl && backSteps < MAX_WALK_STEPS) {
        const prevInfo = await fetchChapterNav(info.prevUrl).catch(() => null);
        if (!prevInfo || !isTargetChapter(prevInfo, targetSlug, wanted)) break;
        info = prevInfo;
        backSteps++;
    }

    return info.url;
}

async function getChapterData(url, chapterNumber) {
    let targetUrl = url;

    if (targetUrl.includes('/series/')) {
        const { data: html } = await axios.get(targetUrl, { headers: HEADERS, timeout: 30000 });
        const $ = cheerio.load(html);

        let firstChapterLink = null;
        $('a').each((_, el) => {
            if (!firstChapterLink && /primer\s*cap[ií]tulo/i.test($(el).text())) {
                firstChapterLink = $(el).attr('href');
            }
        });
        if (!firstChapterLink) firstChapterLink = $('a[href*="/capitulo/"]').first().attr('href');

        if (!firstChapterLink) throw new Error('No se encontró ningún capítulo en esta serie.');

        const firstChapterUrl = firstChapterLink.startsWith('http') ? firstChapterLink : `https://olympusxyz.com${firstChapterLink}`;
        const idMatch = firstChapterUrl.match(/\/capitulo\/(\d+)\/([^/?]+)/);
        if (!idMatch) throw new Error('No se pudo interpretar el link del primer capítulo.');

        const firstChapterId = parseInt(idMatch[1], 10);
        const slug = idMatch[2];

        const firstInfo = await fetchChapterNav(firstChapterUrl);
        const firstNumber = firstInfo.number !== null ? firstInfo.number : 1;

        const wanted = parseFloat(chapterNumber);

        if (chapterMatches(firstNumber, wanted) && firstInfo.slug === slug) {
            targetUrl = firstChapterUrl;
        } else {
            const found = await findChapterUrl(firstChapterId, slug, firstNumber, firstChapterUrl, wanted);
            if (!found) throw new Error(`No se encontró el capítulo ${chapterNumber} para esta serie.`);
            targetUrl = found;
        }
    }

    const { data: html } = await axios.get(targetUrl, { headers: HEADERS, timeout: 30000 });
    const $ = cheerio.load(html);

    let title = 'Olympus Manga';
    const pageTitleTag = $('title').first().text() || '';
    const titleMatch = pageTitleTag.match(/Cap[ií]tulo\s+(\d+(?:\.\d+)?)\s+de\s+(.+?)\s*\|\s*Olympus/i);
    if (titleMatch) {
        title = `${titleMatch[2].trim()} - Capítulo ${titleMatch[1]}`;
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
            const src = $(el).attr('src') || $(el).attr('data-src');
            if (src && !src.includes('logo') && !src.includes('avatar') && !src.includes('cover')) {
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

// Descarga inicial y cálculo del peso total original en MB
async function fetchImageBuffer(url) {
    const res = await axios.get(url, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
    return Buffer.from(res.data);
}

// Determina la escala y calidad según las reglas de peso
function getAdaptiveSettings(totalMb) {
    if (totalMb <= 12) {
        return { scale: 1.25, quality: 95 }; // 10MB -> apunta a ~20MB
    } else if (totalMb <= 25) {
        return { scale: 1.22, quality: 94 }; // 20MB -> apunta a ~35MB
    } else if (totalMb <= 45) {
        return { scale: 1.18, quality: 92 }; // 40MB -> apunta a ~55MB
    } else {
        return { scale: 1.15, quality: 90 }; // 60MB -> apunta a ~80MB
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

    if (url.includes('/series/') && !chapterArg) {
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
                if (!firstChapterLink && /primer\s*cap[ií]tulo/i.test($(el).text())) {
                    firstChapterLink = $(el).attr('href');
                }
            });
            if (!firstChapterLink) firstChapterLink = $('a[href*="/capitulo/"]').first().attr('href');

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

    if (chapterArg !== undefined && !/^\d+(\.\d+)?$/.test(chapterArg)) {
        return m.reply('❌ El número de capítulo debe ser un número válido (ej: 13 o 61.05).');
    }

    try {
        const [PDFDocument, sharp] = await Promise.all([loadPdfLib(), loadSharp()]);
        
        await m.reply(`🔍 Buscando capítulo *${chapterArg}*... Esto puede tomar unos segundos.`);
        
        const { title, images } = await getChapterData(url, chapterArg);

        if (!images || images.length === 0) {
            return m.reply('❌ No se encontraron imágenes en el capítulo.');
        }

        await m.reply(`📸 *${title}*\nDescargando *${images.length}* imágenes para evaluar calidad...`);

        // 1. Descargar buffers iniciales
        const rawBuffers = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => fetchImageBuffer(imgUrl));
        const validBuffers = rawBuffers.filter(Boolean);

        // 2. Calcular peso acumulado inicial
        const totalBytes = validBuffers.reduce((acc, buf) => acc + buf.length, 0);
        const totalMb = totalBytes / (1024 * 1024);

        // 3. Determinar perfil de mejora según los MB detectados
        const settings = getAdaptiveSettings(totalMb);

        // 4. Procesar y reescalar según el perfil dinámico
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
