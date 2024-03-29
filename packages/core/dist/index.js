import 'sharp';

const METADATA = Symbol('image metadata');
function setMetadata(image, key, value) {
    image[METADATA] && (image[METADATA][key] = value);
}
function getMetadata(image, key) {
    var _a;
    return (_a = image[METADATA]) === null || _a === void 0 ? void 0 : _a[key];
}

const kernelValues = ['nearest', 'cubic', 'mitchell', 'lanczos2', 'lanczos3'];
const getKernel = ({ kernel }, image) => {
    if (kernel && kernelValues.includes(kernel)) {
        image[METADATA].kernel = kernel;
        return kernel;
    }
};

const positionValues = [
    'top',
    'right top',
    'right',
    'right bottom',
    'bottom',
    'left bottom',
    'left',
    'left top',
    'north',
    'northeast',
    'east',
    'southeast',
    'south',
    'southwest',
    'west',
    'northwest',
    'center',
    'centre',
    'entropy',
    'attention'
];
const positionShorthands = [
    'top',
    'right top',
    'right',
    'right bottom',
    'bottom',
    'left bottom',
    'left',
    'left top'
];
const getPosition = (config, image) => {
    let position = undefined;
    if (config.position && positionValues.includes(config.position)) {
        position = config.position;
    }
    else {
        position = Object.keys(config).find((k) => positionShorthands.includes(k) && config[k] === '');
    }
    if (!position)
        return;
    image[METADATA].position = position;
    return position;
};

const getBackground = ({ background }, image) => {
    if (typeof background !== 'string' || !background.length)
        return;
    image[METADATA].backgroundDirective = background;
    return background;
};

const blur = (config) => {
    let blur = undefined;
    blur = config.blur ? parseFloat(config.blur) : undefined;
    blur || (blur = config.blur === 'true');
    blur || (blur = config.blur === '');
    if (!blur)
        return;
    return function blurTransform(image) {
        image[METADATA].blur = blur;
        return image.blur(blur);
    };
};

const FORMAT_TO_EFFORT_RANGE = {
    avif: [0, 9],
    gif: [1, 10],
    heif: [0, 9],
    jxl: [3, 9],
    png: [1, 10],
    webp: [0, 6]
};
function parseEffort(effort, format) {
    var _a, _b;
    if (effort === 'min') {
        return (_a = FORMAT_TO_EFFORT_RANGE[format]) === null || _a === void 0 ? void 0 : _a[0];
    }
    else if (effort === 'max') {
        return (_b = FORMAT_TO_EFFORT_RANGE[format]) === null || _b === void 0 ? void 0 : _b[1];
    }
    return parseInt(effort);
}
const getEffort = ({ effort: _effort }, image) => {
    var _a;
    if (!_effort)
        return;
    const format = ((_a = getMetadata(image, 'format')) !== null && _a !== void 0 ? _a : '');
    const effort = parseEffort(_effort, format);
    if (!Number.isInteger(effort))
        return;
    setMetadata(image, 'effort', effort);
    return effort;
};

const fitValues = ['cover', 'contain', 'fill', 'inside', 'outside'];
const getFit = (config, image) => {
    let fit = undefined;
    if (config.fit && fitValues.includes(config.fit)) {
        fit = config.fit;
    }
    else {
        fit = Object.keys(config).find((k) => fitValues.includes(k) && config[k] === '');
    }
    if (!fit)
        return;
    image[METADATA].fit = fit;
    return fit;
};

const flatten = (config) => {
    if (config.flatten !== '' && config.flatten !== 'true')
        return;
    return function flattenTransform(image) {
        image[METADATA].flatten = true;
        return image.flatten({
            background: getBackground(config, image)
        });
    };
};

const flip = ({ flip }) => {
    if (flip !== '' && flip !== 'true')
        return;
    return function flipTransform(image) {
        image[METADATA].flip = true;
        return image.flip();
    };
};

const flop = ({ flop }) => {
    if (flop !== '' && flop !== 'true')
        return;
    return function flopTransform(image) {
        image[METADATA].flop = true;
        return image.flop();
    };
};

const getQuality = ({ quality: _quality }, image) => {
    const quality = _quality && parseInt(_quality);
    if (!quality)
        return;
    image[METADATA].quality = quality;
    return quality;
};

const getProgressive = ({ progressive }, image) => {
    if (progressive !== '' && progressive !== 'true')
        return;
    image[METADATA].progressive = true;
    return true;
};

const getLossless = ({ lossless }, image) => {
    if (lossless !== '' && lossless !== 'true')
        return;
    image[METADATA].lossless = true;
    return true;
};

const format = (config) => {
    let format;
    if (!config.format) {
        return;
    }
    else {
        format = config.format;
    }
    return function formatTransform(image) {
        image[METADATA].format = format;
        return image.toFormat(format, {
            compression: format == 'heif' ? 'av1' : undefined,
            effort: getEffort(config, image),
            lossless: getLossless(config, image),
            progressive: getProgressive(config, image),
            quality: getQuality(config, image)
        });
    };
};

const grayscale = ({ grayscale }) => {
    if (grayscale !== '' && grayscale !== 'true')
        return;
    return function grayscaleTransform(image) {
        image[METADATA].grayscale = true;
        return image.grayscale();
    };
};

const hsb = (config) => {
    const hue = config.hue && parseInt(config.hue);
    const saturation = config.saturation && parseFloat(config.saturation);
    const brightness = config.brightness && parseFloat(config.brightness);
    if (!hue && !saturation && !brightness)
        return;
    return function hsbTransform(image) {
        image[METADATA].hue = hue;
        image[METADATA].saturation = saturation;
        image[METADATA].brightness = brightness;
        return image.modulate({
            hue: hue || 0,
            saturation: saturation || 1,
            brightness: brightness || 1
        });
    };
};

const invert = ({ invert }) => {
    if (invert !== '' && invert !== 'true')
        return;
    return function invertTransform(image) {
        image[METADATA].invert = true;
        return image.negate();
    };
};

const median = (config) => {
    const median = config.median ? parseInt(config.median) : undefined;
    if (!median)
        return;
    return function medianTransform(image) {
        image[METADATA].median = median;
        return image.median(median);
    };
};

const normalize = ({ normalize }) => {
    if (normalize !== '' && normalize !== 'true')
        return;
    return function normalizeTransform(image) {
        image[METADATA].normalize = true;
        return image.normalize();
    };
};

/**
 * This function parses a user provided aspect-ratio string into a float.
 * Valid syntaxes are `16:9` or `1.777`
 * @param aspect
 * @returns
 */
function parseAspect(aspect) {
    const parts = aspect.split(':');
    let aspectRatio;
    if (parts.length === 1) {
        // the string was a float
        aspectRatio = parseFloat(parts[0]);
    }
    else if (parts.length === 2) {
        // the string was a colon delimited aspect ratio
        const [width, height] = parts.map((str) => parseInt(str));
        if (!width || !height)
            return undefined;
        aspectRatio = width / height;
    }
    if (!aspectRatio || aspectRatio <= 0)
        return undefined;
    return aspectRatio;
}
const resize = (config, context) => {
    const width = parseInt(config.w || '');
    const height = parseInt(config.h || '');
    const aspect = parseAspect(config.aspect || '');
    const allowUpscale = config.allowUpscale === '' || config.allowUpscale === 'true';
    const basePixels = parseInt(config.basePixels || '');
    if (!width && !height && !aspect)
        return;
    return function resizeTransform(image) {
        const fit = getFit(config, image);
        // calculate finalWidth & finalHeight
        const originalWidth = image[METADATA].width;
        const originalHeight = image[METADATA].height;
        const originalAspect = originalWidth / originalHeight;
        let finalWidth = width, finalHeight = height, finalAspect = aspect;
        if (aspect && !width && !height) {
            // only aspect was given, need to calculate which dimension to crop
            if (aspect > originalAspect) {
                finalHeight = originalWidth / aspect;
                finalWidth = originalWidth;
            }
            else {
                finalHeight = originalHeight;
                finalWidth = originalHeight / aspect;
            }
        }
        else if (width && height) {
            // width & height BOTH given, need to look at fit
            switch (fit) {
                case 'inside':
                    if (width / height < originalAspect) {
                        finalHeight = width / originalAspect;
                    }
                    else {
                        finalWidth = height * originalAspect;
                    }
                    break;
                case 'outside':
                    if (width / height > originalAspect) {
                        finalHeight = width / originalAspect;
                    }
                    else {
                        finalWidth = height * originalAspect;
                    }
                    break;
            }
            finalAspect = finalWidth / finalHeight;
        }
        else if (!height) {
            // only width was provided, need to calculate height
            finalAspect = aspect || originalAspect;
            finalHeight = width / finalAspect;
        }
        else if (!width) {
            // only height was provided, need to calculate width
            finalAspect = aspect || originalAspect;
            finalWidth = height * finalAspect;
        }
        if (!allowUpscale && (finalHeight > originalHeight || finalWidth > originalWidth)) {
            finalHeight = originalHeight;
            finalWidth = originalWidth;
            finalAspect = originalAspect;
            if (context.manualSearchParams.has('w') || context.manualSearchParams.has('h')) {
                context.logger.info('allowUpscale not enabled. Image width, height and aspect ratio reverted to original values');
            }
        }
        finalWidth = Math.round(finalWidth);
        finalHeight = Math.round(finalHeight);
        image[METADATA].height = finalHeight;
        image[METADATA].width = finalWidth;
        image[METADATA].aspect = finalAspect;
        image[METADATA].allowUpscale = allowUpscale;
        image[METADATA].pixelDensityDescriptor = basePixels > 0 ? finalWidth / basePixels + 'x' : undefined;
        return image.resize({
            width: finalWidth || undefined,
            height: finalHeight || undefined,
            withoutEnlargement: !allowUpscale,
            fit,
            position: getPosition(config, image),
            kernel: getKernel(config, image),
            background: getBackground(config, image)
        });
    };
};

const rotate = (config) => {
    const rotate = config.rotate && parseInt(config.rotate);
    if (!rotate)
        return;
    return function rotateTransform(image) {
        image[METADATA].rotate = rotate;
        return image.rotate(rotate, {
            background: getBackground(config, image)
        });
    };
};

const tint = ({ tint }) => {
    if (typeof tint !== 'string' || !tint.length)
        return;
    return function tintTransform(image) {
        image[METADATA].tint = '#' + tint;
        return image.tint('#' + tint);
    };
};

const builtins = [
    blur,
    flatten,
    flip,
    flop,
    format,
    grayscale,
    hsb,
    invert,
    median,
    normalize,
    resize,
    rotate,
    tint
];

const urlFormat = () => (metadatas) => {
    const urls = metadatas.map((metadata) => metadata.src);
    return urls.length == 1 ? urls[0] : urls;
};
const srcsetFormat = () => metadatasToSourceset;
const metadataFormat = (whitelist) => (metadatas) => {
    const result = whitelist
        ? metadatas.map((cfg) => Object.fromEntries(Object.entries(cfg).filter(([k]) => whitelist.includes(k))))
        : metadatas;
    result.forEach((m) => delete m.image);
    return result.length === 1 ? result[0] : result;
};
const metadatasToSourceset = (metadatas) => metadatas
    .map((meta) => {
    const density = meta.pixelDensityDescriptor;
    return density ? `${meta.src} ${density}` : `${meta.src} ${meta.width}w`;
})
    .join(', ');
/** normalizes the format for use in mime-type */
const getFormat = (m) => {
    if (!m.format)
        throw new Error(`Could not determine image format`);
    return m.format.replace('jpg', 'jpeg');
};
const imgFormat = () => (metadatas) => {
    let largestImage;
    let largestImageSize = 0;
    for (let i = 0; i < metadatas.length; i++) {
        const m = metadatas[i];
        if (m.width > largestImageSize) {
            largestImage = m;
            largestImageSize = m.width;
        }
    }
    const result = {
        src: largestImage === null || largestImage === void 0 ? void 0 : largestImage.src,
        w: largestImage === null || largestImage === void 0 ? void 0 : largestImage.width,
        h: largestImage === null || largestImage === void 0 ? void 0 : largestImage.height
    };
    if (metadatas.length >= 2) {
        result.srcset = metadatasToSourceset(metadatas);
    }
    return result;
};
/** fallback format should be specified last */
const pictureFormat = () => (metadatas) => {
    const fallbackFormat = [...new Set(metadatas.map((m) => getFormat(m)))].pop();
    let largestFallback;
    let largestFallbackSize = 0;
    let fallbackFormatCount = 0;
    for (let i = 0; i < metadatas.length; i++) {
        const m = metadatas[i];
        if (getFormat(m) === fallbackFormat) {
            fallbackFormatCount++;
            if (m.width > largestFallbackSize) {
                largestFallback = m;
                largestFallbackSize = m.width;
            }
        }
    }
    const sourceMetadatas = {};
    for (let i = 0; i < metadatas.length; i++) {
        const m = metadatas[i];
        const f = getFormat(m);
        // we don't need to create a source tag for the fallback format if there is
        // only a single image in that format
        if (f === fallbackFormat && fallbackFormatCount < 2) {
            continue;
        }
        if (sourceMetadatas[f]) {
            sourceMetadatas[f].push(m);
        }
        else {
            sourceMetadatas[f] = [m];
        }
    }
    const sources = {};
    for (const [key, value] of Object.entries(sourceMetadatas)) {
        sources[key] = metadatasToSourceset(value);
    }
    const result = {
        sources,
        // the fallback should be the largest image in the fallback format
        // we assume users should never upsize an image because that is just wasted
        // bytes since the browser can upsize just as well
        img: {
            src: largestFallback === null || largestFallback === void 0 ? void 0 : largestFallback.src,
            w: largestFallback === null || largestFallback === void 0 ? void 0 : largestFallback.width,
            h: largestFallback === null || largestFallback === void 0 ? void 0 : largestFallback.height
        }
    };
    return result;
};
const builtinOutputFormats = {
    url: urlFormat,
    srcset: srcsetFormat,
    img: imgFormat,
    picture: pictureFormat,
    metadata: metadataFormat,
    meta: metadataFormat
};

function parseURL(rawURL) {
    return new URL(rawURL.replace(/#/g, '%23'), 'file://');
}
function extractEntries(searchParams) {
    const entries = [];
    for (const [key, value] of searchParams) {
        const values = value.includes(':') ? [value] : value.split(';');
        entries.push([key, values]);
    }
    return entries;
}

/**
 * This function calculates the cartesian product of two or more arrays and is straight from stackoverflow ;)
 * Should be replaced with something more legible but works for now.
 */
const cartesian = (...a) => 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
a.reduce((a, b) => a.flatMap((d) => b.map((e) => [d, e].flat())));
/**
 * This function builds up all possible combinations the given entries can be combined
 * and returns it as an array of objects that can be given to a the transforms.
 * @param entries The url parameter entries
 * @returns An array of directive options
 */
function resolveConfigs(entries, outputFormats) {
    // create a new array of entries for each argument
    const singleArgumentEntries = entries
        .filter(([k]) => !(k in outputFormats))
        .map(([key, values]) => values.map((v) => [[key, v]]));
    // do a cartesian product on all entries to get all combinations we need to produce
    const combinations = singleArgumentEntries
        // .filter(([key]) => !(key[0][0] in outputFormats))
        .reduce((prev, cur) => (prev.length ? cartesian(prev, cur) : cur), []);
    const metadataAddons = entries.filter(([k]) => k in outputFormats);
    // and return as an array of objects
    const out = combinations.map((options) => Object.fromEntries([...options, ...metadataAddons]));
    return out.length ? out : [Object.fromEntries(metadataAddons)];
}

const consoleLogger = {
    info(msg) {
        console.info(msg);
    },
    warn(msg) {
        console.warn(msg);
    },
    error(msg) {
        console.error(msg);
    }
};

function generateTransforms(config, factories, manualSearchParams, logger) {
    if (logger === undefined) {
        logger = consoleLogger;
    }
    const transforms = [];
    const parametersUsed = new Set();
    const context = {
        useParam: (k) => parametersUsed.add(k),
        manualSearchParams,
        logger
    };
    for (const directive of factories) {
        const transform = directive(config, context);
        if (typeof transform === 'function')
            transforms.push(transform);
    }
    return {
        transforms,
        parametersUsed
    };
}

async function applyTransforms(transforms, image, removeMetadata = true) {
    image[METADATA] = { ...(await image.metadata()) };
    if (removeMetadata) {
        // delete the private metadata
        delete image[METADATA].exif;
        delete image[METADATA].iptc;
        delete image[METADATA].xmp;
        delete image[METADATA].tifftagPhotoshop;
        delete image[METADATA].icc;
    }
    else {
        image.withMetadata();
    }
    for (const transform of transforms) {
        image = await transform(image);
    }
    return {
        image,
        metadata: image[METADATA]
    };
}

export { applyTransforms, blur, builtinOutputFormats, builtins, extractEntries, fitValues, flatten, flip, flop, format, generateTransforms, getBackground, getEffort, getFit, getKernel, getLossless, getMetadata, getPosition, getProgressive, getQuality, grayscale, hsb, imgFormat, invert, kernelValues, median, metadataFormat, normalize, parseURL, pictureFormat, positionShorthands, positionValues, resize, resolveConfigs, rotate, setMetadata, srcsetFormat, tint, urlFormat };
//# sourceMappingURL=index.js.map
