/// <reference types="node" resolution-mode="require"/>
import type { ImageConfig } from 'imagetools-core';
export declare const createBasePath: (base?: string) => string;
export declare function generateImageID(url: URL, config: ImageConfig, imageBuffer: Buffer): Promise<string>;
export declare const generateCacheID: (path: string) => string;
export declare const checksumFile: (algorithm: string, path: string) => Promise<string>;
