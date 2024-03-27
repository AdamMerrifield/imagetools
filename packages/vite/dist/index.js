import path, { basename, extname } from 'node:path';
import { join } from 'node:path/posix';
import { statSync, mkdirSync, existsSync, createReadStream } from 'node:fs';
import { utimes, writeFile, readFile, opendir, stat, rm } from 'node:fs/promises';
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

const defaultOptions = {
    include: /^[^?]+\.(avif|gif|heif|jpeg|jpg|png|tiff|webp)(\?.*)?$/,
    exclude: 'public/**/*',
    removeMetadata: true
};
function imagetools(userOptions = {}) {
    var _a, _b, _c, _d, _e, _f;
    const pluginOptions = { ...defaultOptions, ...userOptions };
    const cacheOptions = {
        enabled: (_b = (_a = pluginOptions.cache) === null || _a === void 0 ? void 0 : _a.enabled) !== null && _b !== void 0 ? _b : true,
        dir: (_d = (_c = pluginOptions.cache) === null || _c === void 0 ? void 0 : _c.dir) !== null && _d !== void 0 ? _d : './node_modules/.cache/imagetools',
        retention: (_f = (_e = pluginOptions.cache) === null || _e === void 0 ? void 0 : _e.retention) !== null && _f !== void 0 ? _f : 86400
    };
    mkdirSync(`${cacheOptions.dir}`, { recursive: true });
    const filter = createFilter(pluginOptions.include, pluginOptions.exclude);
    const transformFactories = pluginOptions.extendTransforms ? pluginOptions.extendTransforms(builtins) : builtins;
    const outputFormats = pluginOptions.extendOutputFormats
        ? pluginOptions.extendOutputFormats(builtinOutputFormats)
        : builtinOutputFormats;
    let viteConfig;
    let basePath;
    const generatedImages = new Map();
    return {
        name: 'imagetools',
        enforce: 'pre',
        configResolved(cfg) {
            viteConfig = cfg;
            basePath = createBasePath(viteConfig.base);
        },
        async load(id) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
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
            const outputMetadatas = [];
            const logger = {
                info: (msg) => viteConfig.logger.info(msg),
                warn: (msg) => this.warn(msg),
                error: (msg) => this.error(msg)
            };
            const imageBuffer = await img.clone().toBuffer();
            for (const config of imageConfigs) {
                const id = await generateImageID(srcURL, config, imageBuffer);
                let image;
                let metadata;
                if (cacheOptions.enabled && existsSync(`${cacheOptions.dir}/${id}`)) {
                    const imagePath = `${cacheOptions.dir}/${id}`;
                    metadata = (await sharp(imagePath).metadata());
                    metadata.imagePath = imagePath;
                    const date = new Date();
                    utimes(imagePath, date, date);
                }
                else {
                    const { transforms } = generateTransforms(config, transformFactories, srcURL.searchParams, logger);
                    const res = await applyTransforms(transforms, img, pluginOptions.removeMetadata);
                    metadata = res.metadata;
                    if (cacheOptions.enabled) {
                        const imagePath = `${cacheOptions.dir}/${id}`;
                        await writeFile(imagePath, await res.image.toBuffer());
                        metadata.imagePath = imagePath;
                    }
                    else {
                        image = res.image;
                    }
                }
                if (viteConfig.command === 'serve') {
                    generatedImages.set(id, { image, metadata });
                    metadata.src = join((_d = (_c = viteConfig === null || viteConfig === void 0 ? void 0 : viteConfig.server) === null || _c === void 0 ? void 0 : _c.origin) !== null && _d !== void 0 ? _d : '', basePath) + id;
                }
                else {
                    const fileHandle = this.emitFile({
                        name: basename(pathname, extname(pathname)) + `.${metadata.format}`,
                        source: image ? await image.toBuffer() : await readFile(metadata.imagePath),
                        type: 'asset'
                    });
                    metadata.src = `__VITE_ASSET__${fileHandle}__`;
                }
                metadata.image = image;
                outputMetadatas.push(metadata);
            }
            let outputFormat = urlFormat();
            const asParam = (_e = directives.get('as')) === null || _e === void 0 ? void 0 : _e.split(':');
            const as = asParam ? asParam[0] : undefined;
            for (const [key, format] of Object.entries(outputFormats)) {
                if (as === key) {
                    outputFormat = format(asParam && asParam[1] ? asParam[1].split(';') : undefined);
                    break;
                }
            }
            return dataToEsm(await outputFormat(outputMetadatas), {
                namedExports: (_h = (_f = pluginOptions.namedExports) !== null && _f !== void 0 ? _f : (_g = viteConfig.json) === null || _g === void 0 ? void 0 : _g.namedExports) !== null && _h !== void 0 ? _h : true,
                compact: (_j = !!viteConfig.build.minify) !== null && _j !== void 0 ? _j : false,
                preferConst: true
            });
        },
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                var _a, _b;
                if ((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith(basePath)) {
                    const [, id] = req.url.split(basePath);
                    const { image, metadata } = (_b = generatedImages.get(id)) !== null && _b !== void 0 ? _b : {};
                    if (!metadata)
                        throw new Error(`vite-imagetools cannot find image with id "${id}" this is likely an internal error`);
                    res.setHeader('Cache-Control', 'max-age=360000');
                    if (!image) {
                        res.setHeader('Content-Type', `image/${metadata.format}`);
                        return createReadStream(metadata.imagePath).pipe(res);
                    }
                    if (pluginOptions.removeMetadata === false) {
                        image.withMetadata();
                    }
                    res.setHeader('Content-Type', `image/${getMetadata(image, 'format')}`);
                    return image.clone().pipe(res);
                }
                next();
            });
        },
        async buildEnd(error) {
            if (!error && cacheOptions.enabled && cacheOptions.retention && viteConfig.command !== 'serve') {
                const dir = await opendir(cacheOptions.dir);
                for await (const dirent of dir) {
                    if (dirent.isFile()) {
                        const imagePath = `${cacheOptions.dir}/${dirent.name}`;
                        const stats = await stat(imagePath);
                        if (Date.now() - stats.mtimeMs > cacheOptions.retention * 1000) {
                            console.debug(`deleting stale cached image ${dirent.name}`);
                            await rm(imagePath);
                        }
                    }
                }
            }
        }
    };
}

export { imagetools };
//# sourceMappingURL=index.js.map
