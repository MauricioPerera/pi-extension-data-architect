/**
 * Pi Extension: Data Architect v2.1.0
 * 
 * Entry point for programmatic access.
 * The main extension logic is in extensions/data-architect.ts,
 * this file just exports metadata and bootstrap utilities.
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export const name = 'pi-extension-data-architect';
export const version = require('./package.json').version;
export const extensions = [path.join(__dirname, 'extensions', 'data-architect.ts')];
export const skillsDir = path.join(__dirname, 'skills');
export const bootstrap = path.join(__dirname, 'scripts', 'bootstrap.js');
