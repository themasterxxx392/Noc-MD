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
    'Referer': 'https://dragontranslation.org/'
};

async function getChapterData(url, chapterNumber) {
    let targetUrl = url;

    if (targetUrl.includes('/manga/') && !targetUrl.includes('/capitulo-')) {
        targetUrl = targetUrl.replace(/\/+$/, '');
        targetUrl = `${targetUrl}/capitulo-${chapterNumber}/`;
    }

    const { data: html } = await axios.get(targetUrl, { headers: HEADERS, timeout: 30000 });
    const $ = cheerio.load(html);

    let title = 'Dragon Translation';
    const pageTitleTag = $('title').first().text() || '';
    if (pageTitleTag) {
        title = pageTitleTag.replace(/\s*[-–—]\s*Dragon Translation.*$/, '').trim();
    }

    let imageUrls = [];

    $('.reading-content img, .page-break img, .chapter-content img, .entry-content img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('srcset');
        if (src) {
            const cleanSrc = src.split(',')[0].trim().split(' ')[0];
            imageUrls.push(cleanSrc);
        }
    });

    if (imageUrls.length === 0) {
        $('img').each((_, el) => {
            const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src');
            if (src && !src.includes('logo') && !src.includes('avatar') && !src.includes('cover') && !src.includes('icon') && !src.includes('banner')) {
                imageUrls.push(src);
            }
        });
    }

    const cleanUrls = imageUrls.map(img => {
        if (!img) return null;
        if (img.startsWith('//')) return 'https:' + img;
        if (img.startsWith('/')) return 'https://dragontranslation.org' + img;
        return img;
    }).filter(Boolean);

    return { title: title || `Capítulo ${chapterNumber}`, images: cleanUrls };
}

async function processImage(imageUrl, sharp) {
    try {
        const res = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: HEADERS, timeout: 25000 });
        const buffer = Buffer.from(res.data);

        try {
            const img = sharp(buffer);
            const meta = await img.metadata();

            const CROP = 4; 
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
                .jpeg({ quality: 75, force: true })
                .toBuffer();

            return { buffer: cleanBuffer };
        } catch (sharpError) {
            return { buffer };
        }
    } catch (err) {
        console.error(`Error descargando imagen ${imageUrl}:`, err.message);
        return null;
    }
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
        return m.reply(`❌ *Ingresa un enlace de Dragon Translation.*\n\n📌 Ejemplo capítulo único: .${command} https://dragontranslation.org/manga/un-mundo-sin-hombres/ 1\n📌 Ejemplo rango de capítulos: .${command} https://dragontranslation.org/manga/un-mundo-sin-hombres/ 1-5\n📌 Ver info y portada: .${command} https://dragontranslation.org/manga/un-mundo-sin-hombres/ info`);
    }

    const url = args[0];
    if (!url.includes('dragontranslation')) {
        return m.reply('❌ URL no válida de Dragon Translation.');
    }

    const chapterArg = args[1] ? args[1].trim() : undefined;

    if (url.includes('/manga/') && !url.includes('/capitulo-') && !chapterArg) {
        return m.reply(`⚠️ *Falta el número o rango de capítulos.*

📌 *Ejemplo para descargar:*
.${command} ${url} 1
.${command} ${url} 1-5

📌 *O si quieres ver la info y portada:*
.${command} ${url} info`);
    }

    if (chapterArg && chapterArg.toLowerCase() === 'info') {
        try {
            const { data: html } = await axios.get(url, { headers: HEADERS, timeout: 30000 });
            const $ = cheerio.load(html);
            const pageTitle = $('title').first().text() || '';
            const seriesName = pageTitle.replace(/\s*[-–—]\s*Dragon Translation.*$/, '').trim() || 'Esta serie';

            let coverImg = '';
            $('.summary_image img, .tab-summary img, .profile-manga img, img.wp-post-image').each((_, el) => {
                const src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-lazy-src');
                if (src && !coverImg && !src.includes('logo')) {
                    coverImg = src;
                }
            });

            if (coverImg.startsWith('//')) coverImg = 'https:' + coverImg;
            else if (coverImg.startsWith('/')) coverImg = 'https://dragontranslation.org' + coverImg;

            const chapterNumbers = [];
            
            $('.listing-chapters_wrap li a, li.wp-manga-chapter a, .version-chap li a').each((_, el) => {
                const href = $(el).attr('href') || '';
                const text = $(el).text() || '';
                if (href.includes('/capitulo-')) {
                    const match = href.match(/capitulo-(\d+(?:\.\d+)?)/i) || text.match(/Cap[ií]tulo\s*(\d+(?:\.\d+)?)/i);
                    if (match) {
                        const num = parseFloat(match[1]);
                        if (!chapterNumbers.includes(num)) {
                            chapterNumbers.push(num);
                        }
                    }
                }
            });

            chapterNumbers.sort((a, b) => a - b);

            let listText = '';
            if (chapterNumbers.length > 0) {
                listText = `\n\n*Capítulos:* ${chapterNumbers.join(', ')}`;
            }

            const caption = `📚 *${seriesName}*\n\n📊 *Total de capítulos:* ${chapterNumbers.length}${listText}`;

            if (coverImg) {
                return await conn.sendMessage(m.chat, {
                    image: { url: coverImg },
                    caption: caption
                }, { quoted: m });
            } else {
                return m.reply(caption);
            }

        } catch (error) {
            console.error(error);
            return m.reply(`❌ Ocurrió un error: ${error.message || error}`);
        }
    }

    const rangeMatch = chapterArg ? chapterArg.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/) : null;
    let targetChapterNumber = chapterArg;

    if (url.includes('/capitulo-')) {
        const matchCap = url.match(/capitulo-(\d+(?:\.\d+)?)/i);
        if (matchCap) targetChapterNumber = matchCap[1];
    }

    if (!rangeMatch && (!targetChapterNumber || !/^\d+(\.\d+)?$/.test(targetChapterNumber))) {
        return m.reply('❌ El número o rango de capítulo debe ser válido (ej: 1 o 1-5).');
    }

    try {
        const [PDFDocument, sharp] = await Promise.all([loadPdfLib(), loadSharp()]);
        const pdfDoc = await PDFDocument.create();
        let totalSuccessCount = 0;
        let seriesTitleName = 'Manga';

        if (rangeMatch) {
            const start = parseFloat(rangeMatch[1]);
            const end = parseFloat(rangeMatch[2]);
            
            if (start > end) {
                return m.reply('❌ El rango inicial no puede ser mayor al rango final (ej: 1-5).');
            }

            const chaptersToDownload = [];
            for (let i = start; i <= end; i++) {
                chaptersToDownload.push(i);
            }

            await m.reply(`📥 Descargando del capítulo *${start}* al *${end}* en un solo PDF... Por favor espera, esto puede tardar unos minutos.`);

            for (const chapNum of chaptersToDownload) {
                try {
                    console.log(`🔍 Descargando capítulo ${chapNum}...`);
                    const { title, images } = await getChapterData(url, chapNum);
                    if (!images || images.length === 0) {
                        continue;
                    }
                    seriesTitleName = title.replace(/\s*-\s*Cap[ií]tulo.*$/i, '').trim();

                    const processed = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => processImage(imgUrl, sharp));

                    for (const result of processed) {
                        if (!result || !result.buffer) continue;
                        let img;
                        try {
                            img = await pdfDoc.embedJpg(result.buffer);
                        } catch {
                            try {
                                img = await pdfDoc.embedPng(result.buffer);
                            } catch {
                                continue;
                            }
                        }

                        const page = pdfDoc.addPage([img.width, img.height]);
                        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                        totalSuccessCount++;
                    }
                } catch (err) {
                    console.error(`Error procesando capítulo ${chapNum}:`, err.message);
                }
            }

            if (totalSuccessCount === 0) {
                return m.reply('❌ No se pudo procesar ningún capítulo en el rango indicado.');
            }

            const pdfBytes = await pdfDoc.save();
            const safeFileName = `${seriesTitleName} Capitulos del ${start} al ${end}`.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();

            return await conn.sendMessage(m.chat, {
                document: Buffer.from(pdfBytes),
                mimetype: 'application/pdf',
                fileName: `${safeFileName}.pdf`,
                caption: `📖 *${seriesTitleName}*\n📂 *Capítulos:* Del ${start} al ${end}\n📄 *Total de páginas:* ${totalSuccessCount}\n🌐 *Fuente:* Dragon Translation`
            }, { quoted: m });

        } else {
            await m.reply(`🔍 Buscando capítulo *${targetChapterNumber}* en Dragon Translation... Esto puede tomar unos segundos.`);
            
            const { title, images } = await getChapterData(url, targetChapterNumber);

            if (!images || images.length === 0) {
                return m.reply('❌ No se encontraron imágenes en el capítulo.');
            }

            await m.reply(`📸 *${title}*\nProcesando *${images.length}* páginas...`);

            const processed = await mapWithConcurrency(images, CONCURRENCY, (imgUrl) => processImage(imgUrl, sharp));

            let successCount = 0;
            for (const result of processed) {
                if (!result || !result.buffer) continue;
                
                let img;
                try {
                    img = await pdfDoc.embedJpg(result.buffer);
                } catch {
                    try {
                        img = await pdfDoc.embedPng(result.buffer);
                    } catch {
                        continue;
                    }
                }

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
            const safeFileName = title.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();

            return await conn.sendMessage(m.chat, {
                document: Buffer.from(pdfBytes),
                mimetype: 'application/pdf',
                fileName: `${safeFileName}.pdf`,
                caption: `📖 *${title}*\n📂 *Páginas:* ${successCount}\n🌐 *Fuente:* Dragon Translation`
            }, { quoted: m });
        }

    } catch (error) {
        console.error(error);
        m.reply(`❌ Ocurrió un error: ${error.message || error}`);
    }
};

handler.command = ['dragon', 'dragontranslation'];
export default handler;
