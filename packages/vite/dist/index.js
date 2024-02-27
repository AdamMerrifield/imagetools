import path, { extname, basename } from 'node:path';
import { statSync, createReadStream, existsSync } from 'node:fs';
import { readFile, utimes, mkdir, writeFile, rm, opendir, stat } from 'node:fs/promises';
import { builtins, builtinOutputFormats, parseURL, extractEntries, resolveConfigs, generateTransforms, applyTransforms, urlFormat, getMetadata } from 'imagetools-core';
export * from 'imagetools-core';
import { createFilter, dataToEsm } from '@rollup/pluginutils';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const createBasePath = (base) => {
    return ((base === null || base === void 0 ? void 0 : base.replace(/\/$/, '')) || '') + '/@imagetools/';
};
async function generateImageID(url, config, imageBuffer) {
    if (url.host) {
        const baseURL = new URL(url.origin + url.pathname);
        return hash([baseURL.href, JSON.stringify(config), imageBuffer]);
    }
    // baseURL isn't a valid URL, but just a string used for an identifier
    // use a relative path in the local case so that it's consistent across machines
    const baseURL = new URL(url.protocol + path.relative(process.cwd(), url.pathname));
    const { mtime } = statSync(path.resolve(process.cwd(), decodeURIComponent(url.pathname)));
    return hash([baseURL.href, JSON.stringify(config), mtime.getTime().toString()]);
}
function hash(keyParts) {
    let hash = createHash('sha1');
    for (const keyPart of keyParts) {
        hash = hash.update(keyPart);
    }
    return hash.digest('hex');
}
const generateCacheID = (path) => createHash('sha1').update(path).digest('hex');
const checksumFile = (algorithm, path) => {
    return new Promise(function (resolve, reject) {
        const hash = createHash(algorithm).setEncoding('hex');
        createReadStream(path)
            .pipe(hash)
            .on('error', reject)
            .on('finish', () => {
            hash.end();
            resolve(hash.digest('hex'));
        });
    });
};

const defaultOptions = {
    include: /^[^?]+\.(avif|gif|heif|jpeg|jpg|png|tiff|webp)(\?.*)?$/,
    exclude: 'public/**/*',
    removeMetadata: true,
    cacheRetention: 86400
};
function imagetools(userOptions = {}) {
    const pluginOptions = { ...defaultOptions, ...userOptions };
    const filter = createFilter(pluginOptions.include, pluginOptions.exclude);
    const transformFactories = pluginOptions.extendTransforms ? pluginOptions.extendTransforms(builtins) : builtins;
    const outputFormats = pluginOptions.extendOutputFormats
        ? pluginOptions.extendOutputFormats(builtinOutputFormats)
        : builtinOutputFormats;
    let viteConfig;
    let basePath;
    const processPath = process.cwd();
    const generatedImages = new Map();
    const isSharp = (image) => typeof image.clone === 'function';
    return {
        name: 'imagetools',
        enforce: 'pre',
        configResolved(cfg) {
            viteConfig = cfg;
            basePath = createBasePath(viteConfig.base);
        },
        async load(id) {
            var _a, _b, _c, _d, _e, _f, _g;
            if (!filter(id))
                return null;
            const srcURL = parseURL(id);
            const pathname = decodeURIComponent(srcURL.pathname);
            // lazy loaders so that we can load the metadata in defaultDirectives if needed
            // but if there are no directives then we can just skip loading
            let lazyImg;
            const lazyLoadImage = () => {
                if (lazyImg)
                    return lazyImg;
                return (lazyImg = sharp(pathname));
            };
            let lazyMetadata;
            const lazyLoadMetadata = async () => {
                if (lazyMetadata)
                    return lazyMetadata;
                return (lazyMetadata = await lazyLoadImage().metadata());
            };
            const defaultDirectives = typeof pluginOptions.defaultDirectives === 'function'
                ? await pluginOptions.defaultDirectives(srcURL, lazyLoadMetadata)
                : pluginOptions.defaultDirectives || new URLSearchParams();
            const directives = new URLSearchParams({
                ...Object.fromEntries(defaultDirectives),
                ...Object.fromEntries(srcURL.searchParams)
            });
            if (!directives.toString())
                return null;
            const outputMetadatas = [];
            const logger = {
                info: (msg) => viteConfig.logger.info(msg),
                warn: (msg) => this.warn(msg),
                error: (msg) => this.error(msg)
            };
            const relativeID = id.startsWith(processPath) ? id.slice(processPath.length + 1) : id;
            const cacheID = pluginOptions.cacheDir ? generateCacheID(relativeID) : undefined;
            if (cacheID && pluginOptions.cacheDir && existsSync(`${pluginOptions.cacheDir}/${cacheID}/index.json`)) {
                try {
                    const srcChecksum = await checksumFile('sha1', pathname);
                    const { checksum, metadatas } = JSON.parse(await readFile(`${pluginOptions.cacheDir}/${cacheID}/index.json`, { encoding: 'utf8' }));
                    if (srcChecksum === checksum) {
                        const date = new Date();
                        utimes(`${pluginOptions.cacheDir}/${cacheID}/index.json`, date, date);
                        for (const metadata of metadatas) {
                            if (viteConfig.command === 'serve') {
                                const imageID = metadata.imageID;
                                generatedImages.set(imageID, metadata);
                                metadata.src = basePath + imageID;
                            }
                            else {
                                const fileHandle = this.emitFile({
                                    name: basename(pathname, extname(pathname)) + `.${metadata.format}`,
                                    source: await readFile(metadata.imagePath),
                                    type: 'asset'
                                });
                                metadata.src = `__VITE_ASSET__${fileHandle}__`;
                            }
                            outputMetadatas.push(metadata);
                        }
                    }
                }
                catch (e) {
                    console.error('cache error:', e);
                    outputMetadatas.length = 0;
                }
            }
            if (!outputMetadatas.length) {
                const img = lazyLoadImage();
                const widthParam = directives.get('w');
                const heightParam = directives.get('h');
                if (directives.get('allowUpscale') !== 'true' && (widthParam || heightParam)) {
                    const metadata = await lazyLoadMetadata();
                    const clamp = (s, intrinsic) => [...new Set(s.split(';').map((d) => (parseInt(d) <= intrinsic ? d : intrinsic.toString())))].join(';');
                    if (widthParam) {
                        const intrinsicWidth = metadata.width || 0;
                        directives.set('w', clamp(widthParam, intrinsicWidth));
                    }
                    if (heightParam) {
                        const intrinsicHeight = metadata.height || 0;
                        directives.set('h', clamp(heightParam, intrinsicHeight));
                    }
                }
                const parameters = extractEntries(directives);
                const imageConfigs = (_b = (_a = pluginOptions.resolveConfigs) === null || _a === void 0 ? void 0 : _a.call(pluginOptions, parameters, outputFormats)) !== null && _b !== void 0 ? _b : resolveConfigs(parameters, outputFormats);
                for (const config of imageConfigs) {
                    const { transforms } = generateTransforms(config, transformFactories, srcURL.searchParams, logger);
                    const { image, metadata } = await applyTransforms(transforms, img.clone(), pluginOptions.removeMetadata);
                    const imageBuffer = await image.toBuffer();
                    const imageID = await generateImageID(srcURL, config, imageBuffer);
                    if (viteConfig.command === 'serve') {
                        generatedImages.set(imageID, image);
                        metadata.src = basePath + imageID;
                    }
                    else {
                        const fileHandle = this.emitFile({
                            name: basename(pathname, extname(pathname)) + `.${metadata.format}`,
                            source: imageBuffer,
                            type: 'asset'
                        });
                        metadata.src = `__VITE_ASSET__${fileHandle}__`;
                    }
                    metadata.imageID = imageID;
                    metadata.image = image;
                    outputMetadatas.push(metadata);
                }
                if (pluginOptions.cacheDir) {
                    const relativeID = id.startsWith(processPath) ? id.slice(processPath.length + 1) : id;
                    const cacheID = generateCacheID(relativeID);
                    try {
                        const checksum = await checksumFile('sha1', pathname);
                        await mkdir(`${pluginOptions.cacheDir}/${cacheID}`, { recursive: true });
                        await Promise.all(outputMetadatas.map(async (metadata) => {
                            const { format, image, imageID } = metadata;
                            const imagePath = `${pluginOptions.cacheDir}/${cacheID}/${imageID}.${format}`;
                            if (image)
                                await writeFile(imagePath, await image.toBuffer());
                            metadata.imagePath = imagePath;
                            if (viteConfig.command === 'serve') {
                                generatedImages.set(id, metadata);
                            }
                        }));
                        await writeFile(`${pluginOptions.cacheDir}/${cacheID}/index.json`, JSON.stringify({
                            checksum,
                            created: Date.now(),
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            metadatas: outputMetadatas.map(({ src, image, ...metadata }) => metadata)
                        }), { encoding: 'utf8' });
                    }
                    catch (e) {
                        console.debug(`failed to create cache for ${cacheID}`);
                        await rm(`${pluginOptions.cacheDir}/${cacheID}`, { recursive: true });
                    }
                }
            }
            let outputFormat = urlFormat();
            const asParam = (_c = directives.get('as')) === null || _c === void 0 ? void 0 : _c.split(':');
            const as = asParam ? asParam[0] : undefined;
            for (const [key, format] of Object.entries(outputFormats)) {
                if (as === key) {
                    outputFormat = format(asParam && asParam[1] ? asParam[1].split(';') : undefined);
                    break;
                }
            }
            return dataToEsm(await outputFormat(outputMetadatas), {
                namedExports: (_f = (_d = pluginOptions.namedExports) !== null && _d !== void 0 ? _d : (_e = viteConfig.json) === null || _e === void 0 ? void 0 : _e.namedExports) !== null && _f !== void 0 ? _f : true,
                compact: (_g = !!viteConfig.build.minify) !== null && _g !== void 0 ? _g : false,
                preferConst: true
            });
        },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                var _a;
                if ((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith(basePath)) {
                    const [, id] = req.url.split(basePath);
                    const image = generatedImages.get(id);
                    if (!image)
                        throw new Error(`vite-imagetools cannot find image with id "${id}" this is likely an internal error`);
                    res.setHeader('Cache-Control', 'max-age=360000');
                    if (isSharp(image)) {
                        if (pluginOptions.removeMetadata === false) {
                            image.withMetadata();
                        }
                        res.setHeader('Content-Type', `image/${getMetadata(image, 'format')}`);
                        return image.clone().pipe(res);
                    }
                    else if (image.imagePath) {
                        res.setHeader('Content-Type', `image/${image.format}`);
                        return createReadStream(image.imagePath).pipe(res);
                    }
                    else {
                        throw new Error(`vite-imagetools cannot find image with id "${id}" this is likely an internal error`);
                    }
                }
                next();
            });
        },
        async buildEnd(error) {
            if (!error && pluginOptions.cacheDir && pluginOptions.cacheRetention && viteConfig.command !== 'serve') {
                const dir = await opendir(pluginOptions.cacheDir);
                for await (const dirent of dir) {
                    if (dirent.isDirectory()) {
                        const cacheDir = `${pluginOptions.cacheDir}/${dirent.name}`;
                        try {
                            const stats = await stat(`${cacheDir}/index.json`);
                            if (Date.now() - stats.mtimeMs > pluginOptions.cacheRetention * 1000) {
                                console.debug(`deleting stale cache dir ${dirent.name}`);
                                await rm(cacheDir, { recursive: true });
                            }
                        }
                        catch (e) {
                            console.debug(`deleting invalid cache dir ${dirent.name}`);
                            await rm(cacheDir, { recursive: true });
                        }
                    }
                }
            }
        }
    };
}

export { imagetools };
//# sourceMappingURL=index.js.map
